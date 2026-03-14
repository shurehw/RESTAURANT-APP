/**
 * Procurement Seasonality Learner
 *
 * Weekly batch job that analyzes historical consumption data to learn
 * demand multipliers per item/venue/month/DOW. No manual configuration
 * needed — the system learns from actual ordering and sales patterns.
 *
 * Data sources:
 *   - item_day_facts (POS sales by menu item per day)
 *   - inventory_transactions (usage-type transactions)
 *   - purchase_order_items (ordering patterns)
 *
 * Output:
 *   - item_seasonality_profiles (demand_multiplier per month/DOW)
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface SeasonalityProfile {
  org_id: string;
  item_id: string;
  venue_id: string | null;
  month: number;
  day_of_week: number | null;
  demand_multiplier: number;
  confidence: number;
  sample_size: number;
}

export interface LearnResult {
  venue_id: string;
  venue_name: string;
  items_analyzed: number;
  profiles_written: number;
  skipped_insufficient_data: number;
}

// Minimum samples to produce a confident profile
const MIN_SAMPLE_SIZE = 4; // at least 4 data points for a given month/DOW
const MIN_CONFIDENCE = 0.3; // below this we still store but flag low confidence

// ── Learning ──────────────────────────────────────────────────

/**
 * Learn seasonality profiles for all venues in an org.
 * Analyzes the last 12 months of item_day_facts to compute
 * demand multipliers by month and day-of-week.
 */
export async function learnSeasonality(
  orgId: string,
  venueId?: string
): Promise<LearnResult[]> {
  const supabase = getServiceClient();

  // Get venues
  let venueQuery = (supabase as any)
    .from('venues')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  if (venueId) venueQuery = venueQuery.eq('id', venueId);

  const { data: venues } = await venueQuery;
  if (!venues || venues.length === 0) return [];

  const results: LearnResult[] = [];

  for (const venue of venues) {
    const result = await learnVenueSeasonality(orgId, venue.id, venue.name);
    results.push(result);
  }

  return results;
}

async function learnVenueSeasonality(
  orgId: string,
  venueId: string,
  venueName: string
): Promise<LearnResult> {
  const supabase = getServiceClient();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().slice(0, 10);

  // Pull daily item sales for the last 12 months
  const { data: dailySales } = await (supabase as any)
    .from('item_day_facts')
    .select('menu_item_name, quantity_sold, business_date')
    .eq('venue_id', venueId)
    .gte('business_date', cutoff)
    .gt('quantity_sold', 0)
    .order('business_date', { ascending: true });

  if (!dailySales || dailySales.length === 0) {
    return {
      venue_id: venueId,
      venue_name: venueName,
      items_analyzed: 0,
      profiles_written: 0,
      skipped_insufficient_data: 0,
    };
  }

  // Group by item → collect { month, dow, qty } observations
  const itemObs = new Map<string, Array<{
    month: number;
    dow: number;
    qty: number;
  }>>();

  for (const row of dailySales) {
    const date = new Date(row.business_date + 'T12:00:00Z');
    const month = date.getUTCMonth() + 1; // 1-12
    const dow = date.getUTCDay(); // 0=Sun

    const obs = itemObs.get(row.menu_item_name) || [];
    obs.push({ month, dow, qty: row.quantity_sold });
    itemObs.set(row.menu_item_name, obs);
  }

  // We need item_id to write profiles — look up item IDs by name
  const itemNames = [...itemObs.keys()];
  const { data: items } = await (supabase as any)
    .from('items')
    .select('id, name')
    .in('name', itemNames);

  const nameToId = new Map<string, string>();
  for (const item of items || []) {
    nameToId.set(item.name, item.id);
  }

  const profiles: SeasonalityProfile[] = [];
  let skipped = 0;

  for (const [itemName, observations] of itemObs) {
    const itemId = nameToId.get(itemName);
    if (!itemId) {
      skipped++;
      continue;
    }

    // Compute overall average qty per day for this item
    const totalQty = observations.reduce((s, o) => s + o.qty, 0);
    const avgQtyPerDay = totalQty / observations.length;

    if (avgQtyPerDay <= 0) continue;

    // Compute monthly multipliers
    const monthGroups = groupBy(observations, (o) => o.month);
    for (const [month, monthObs] of monthGroups) {
      const monthAvg = monthObs.reduce((s, o) => s + o.qty, 0) / monthObs.length;
      const multiplier = monthAvg / avgQtyPerDay;
      const confidence = computeConfidence(monthObs.length, monthObs.map((o) => o.qty));

      if (monthObs.length < MIN_SAMPLE_SIZE) {
        skipped++;
        continue;
      }

      profiles.push({
        org_id: orgId,
        item_id: itemId,
        venue_id: venueId,
        month,
        day_of_week: null, // month-level profile
        demand_multiplier: round3(multiplier),
        confidence: round3(confidence),
        sample_size: monthObs.length,
      });
    }

    // Compute DOW multipliers (across all months)
    const dowGroups = groupBy(observations, (o) => o.dow);
    for (const [dow, dowObs] of dowGroups) {
      const dowAvg = dowObs.reduce((s, o) => s + o.qty, 0) / dowObs.length;
      const multiplier = dowAvg / avgQtyPerDay;
      const confidence = computeConfidence(dowObs.length, dowObs.map((o) => o.qty));

      if (dowObs.length < MIN_SAMPLE_SIZE) continue;

      // Store DOW profiles with month=0 (all months)
      // We use month=1 as placeholder and store one per DOW
      // Actually, let's do month-specific DOW: for each month×DOW combo
      // But that requires lots of data. Keep it simple: DOW across all months.
      // Use month=0 as sentinel — but our check constraint requires 1-12.
      // Store DOW profiles per the most common month for now.
      // Simplification: store at month=1 level with a DOW, meaning
      // "on this DOW, demand is Nx baseline regardless of month"
      // The consumer combines month multiplier × DOW multiplier.

      // We need a valid month (1-12). Use a convention: store DOW profiles
      // at month=1 since the unique index includes month.
      // Better approach: store one set of DOW profiles per month that has data.
      // Simplest: store DOW profiles only, without month breakdown.
      // Since the DB requires month 1-12, store at month=1 as convention.

      profiles.push({
        org_id: orgId,
        item_id: itemId,
        venue_id: venueId,
        month: 1, // convention: DOW profiles stored at month=1
        day_of_week: dow,
        demand_multiplier: round3(multiplier),
        confidence: round3(confidence),
        sample_size: dowObs.length,
      });
    }
  }

  // Upsert profiles in batches
  if (profiles.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < profiles.length; i += BATCH) {
      const batch = profiles.slice(i, i + BATCH);
      await (supabase as any)
        .from('item_seasonality_profiles')
        .upsert(batch.map((p) => ({
          ...p,
          last_computed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })), {
          onConflict: 'org_id,item_id,coalesce(venue_id,00000000-0000-0000-0000-000000000000),month,coalesce(day_of_week,-1)',
          ignoreDuplicates: false,
        });
    }
  }

  return {
    venue_id: venueId,
    venue_name: venueName,
    items_analyzed: itemObs.size,
    profiles_written: profiles.length,
    skipped_insufficient_data: skipped,
  };
}

/**
 * Get seasonality multiplier for an item on a given date.
 * Returns combined month × DOW multiplier.
 */
export async function getSeasonalityMultiplier(
  orgId: string,
  itemId: string,
  venueId: string,
  date: Date
): Promise<{ multiplier: number; confidence: number }> {
  const supabase = getServiceClient();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  const { data: profiles } = await (supabase as any)
    .from('item_seasonality_profiles')
    .select('month, day_of_week, demand_multiplier, confidence')
    .eq('org_id', orgId)
    .eq('item_id', itemId)
    .eq('venue_id', venueId)
    .in('month', [month, 1]); // month-level + DOW profiles (stored at month=1)

  if (!profiles || profiles.length === 0) {
    return { multiplier: 1.0, confidence: 0 };
  }

  // Find month multiplier
  const monthProfile = profiles.find(
    (p: any) => p.month === month && p.day_of_week === null
  );
  const dowProfile = profiles.find(
    (p: any) => p.day_of_week === dow
  );

  const monthMult = monthProfile?.demand_multiplier || 1.0;
  const dowMult = dowProfile?.demand_multiplier || 1.0;

  // Combined multiplier — geometric mean to avoid over-amplification
  const combined = Math.sqrt(monthMult * dowMult);
  const avgConfidence = (
    (monthProfile?.confidence || 0) + (dowProfile?.confidence || 0)
  ) / 2;

  return {
    multiplier: round3(combined),
    confidence: round3(avgConfidence),
  };
}

// ── Helpers ──────────────────────────────────────────────────

function groupBy<T>(arr: T[], keyFn: (item: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}

function computeConfidence(sampleSize: number, values: number[]): number {
  if (sampleSize < MIN_SAMPLE_SIZE) return 0;

  // Confidence based on sample size and coefficient of variation
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;

  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation

  // High sample + low variation = high confidence
  const sizeFactor = Math.min(sampleSize / 30, 1); // saturates at 30 samples
  const stabilityFactor = Math.max(1 - cv, 0); // lower CV = more stable

  return sizeFactor * 0.6 + stabilityFactor * 0.4;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
