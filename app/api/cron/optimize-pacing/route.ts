/**
 * Pacing Optimization Cron
 *
 * POST /api/cron/optimize-pacing?date=YYYY-MM-DD (optional)
 *
 * Runs periodically during service hours. For each venue with SR connected:
 * 1. Gathers reservation + demand data
 * 2. Calls AI optimizer for pacing recommendations
 * 3. Stores recommendations for manager review
 * 4. Expires old pending recommendations
 *
 * Auth: CRON_SECRET bearer token
 * Pattern: app/api/cron/enforce/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getSettingsForOrg } from '@/lib/database/sevenrooms-settings';
import { insertRecommendation, expireOldRecommendations } from '@/lib/database/pacing-recommendations';
import { optimizePacing, type PacingOptimizerInput } from '@/lib/ai/pacing-optimizer';
import {
  fetchShiftsForDate,
  fetchReservationsForVenueDate,
  resolveSevenRoomsVenueId,
  fetchWidgetAccessRulesForVenue,
  type SevenRoomsShift,
} from '@/lib/integrations/sevenrooms';
import {
  fetchHistoricalNoShowRate,
  fetchHistoricalTurnTimes,
} from '@/lib/database/tipsee';
import { getTipseeMappingForVenue, getSalesPaceSettings, getLatestSnapshot, getForecastForDate } from '@/lib/database/sales-pace';
import {
  getActiveAccessRulesForDate,
  getReservationsForVenueDate as getNativeReservations,
  aiAdjustAccessRule,
} from '@/lib/database/reservations';

// ── Auth ─────────────────────────────────────────────────────────

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

// ── Helpers ──────────────────────────────────────────────────────

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Main Handler ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const dow = new Date(date + 'T12:00:00').getDay();
  const dayOfWeek = DOW_NAMES[dow];

  const supabase = getServiceClient();

  // Get all orgs
  const { data: orgs } = await (supabase as any)
    .from('organizations')
    .select('id, name');

  if (!orgs || orgs.length === 0) {
    return NextResponse.json({ message: 'No organizations found', duration_ms: Date.now() - t0 });
  }

  // Expire old recommendations first
  const expired = await expireOldRecommendations();

  const results: Array<{ org: string; venues: number; recommendations: number; errors: string[] }> = [];

  for (const org of orgs) {
    const orgResult = { org: org.name, venues: 0, recommendations: 0, errors: [] as string[] };

    try {
      const venueSettings = await getSettingsForOrg(org.id);
      const connectedVenues = venueSettings.filter(v => v.is_connected && v.sr_venue_id);
      orgResult.venues = connectedVenues.length;

      // Process venues in parallel (capped at 3 concurrent)
      const venueResults = await Promise.allSettled(
        connectedVenues.map(venue => processVenue(venue, org.id, date, dayOfWeek, dow))
      );

      for (const result of venueResults) {
        if (result.status === 'fulfilled') {
          orgResult.recommendations += result.value;
        } else {
          orgResult.errors.push(result.reason?.message || 'Unknown error');
        }
      }
    } catch (err: any) {
      orgResult.errors.push(err.message || 'Org processing failed');
    }

    results.push(orgResult);
  }

  return NextResponse.json({
    date,
    dayOfWeek,
    expired,
    results,
    duration_ms: Date.now() - t0,
  });
}

// ── Per-Venue Processing ─────────────────────────────────────────

async function processVenue(
  venue: { venue_id: string; venue_name: string; sr_venue_id: string | null; org_id: string; covers_per_interval: number | null; custom_pacing: Record<string, number>; interval_minutes: number | null; turn_time_overrides: Record<string, number> },
  orgId: string,
  date: string,
  dayOfWeek: string,
  dow: number,
): Promise<number> {
  if (!venue.sr_venue_id) return 0;

  // Gather data in parallel
  const locationUuids = await getTipseeMappingForVenue(venue.venue_id).catch(() => [] as string[]);

  const [shifts, srRezs, noShowData, historicalTurnsMap, salesSettings, widgetAccessRules] = await Promise.all([
    fetchShiftsForDate(venue.sr_venue_id, date).catch(() => [] as SevenRoomsShift[]),
    fetchReservationsForVenueDate(venue.sr_venue_id, date).catch(() => []),
    locationUuids.length > 0
      ? fetchHistoricalNoShowRate(locationUuids, dow, 90).catch(() => ({ noShowCount: 0, totalCount: 0, rate: 0 }))
      : Promise.resolve({ noShowCount: 0, totalCount: 0, rate: 0 }),
    locationUuids.length > 0
      ? fetchHistoricalTurnTimes(locationUuids, dow, 90).catch(() => new Map<string, number>())
      : Promise.resolve(new Map<string, number>()),
    getSalesPaceSettings(venue.venue_id).catch(() => null),
    fetchWidgetAccessRulesForVenue(venue.venue_id, date).catch(() => []),
  ]);

  const noShowRate = typeof noShowData === 'number' ? noShowData : noShowData.rate;
  const historicalTurns: Record<string, number> = historicalTurnsMap instanceof Map
    ? Object.fromEntries(historicalTurnsMap)
    : historicalTurnsMap;

  if (shifts.length === 0 && srRezs.length === 0) return 0;

  // Get sales data
  let salesData = { currentRevenue: null as number | null, forecastedRevenue: null as number | null, sdlwRevenue: null as number | null, avgRevenuePerCover: null as number | null };
  try {
    const [snapshot, forecast] = await Promise.all([
      getLatestSnapshot(venue.venue_id).catch(() => null),
      getForecastForDate(venue.venue_id, date).catch(() => null),
    ]);
    if (snapshot) {
      salesData.currentRevenue = snapshot.net_sales;
      if (snapshot.covers_count && snapshot.covers_count > 0) {
        salesData.avgRevenuePerCover = snapshot.net_sales / snapshot.covers_count;
      }
    }
    if (forecast) {
      salesData.forecastedRevenue = forecast.revenue_predicted;
    }
  } catch { /* non-critical */ }

  // Build slot data from SR reservations
  const slotMap = new Map<string, { coversBooked: number; pacingLimit: number | null; tablesBooked: number; tablesAvailable: number }>();
  const primaryShift = shifts[0];

  // Count covers per hour block
  for (const rez of srRezs) {
    if (!rez.arrival_time || rez.status === 'CANCELLED' || rez.status === 'NO_SHOW') continue;
    const hmMatch = rez.arrival_time.match(/(\d{1,2}):(\d{2})/);
    if (!hmMatch) continue;
    let h = parseInt(hmMatch[1]);
    const m = parseInt(hmMatch[2]);
    const roundedMin = m < 30 ? '00' : '30';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h > 12 ? h - 12 : h || 12;
    const label = `${h12}:${roundedMin} ${ampm}`;

    const existing = slotMap.get(label) || { coversBooked: 0, pacingLimit: primaryShift?.covers_per_seating_interval ?? null, tablesBooked: 0, tablesAvailable: 0 };
    existing.coversBooked += rez.max_guests || 0;
    existing.tablesBooked += 1;
    slotMap.set(label, existing);
  }

  const bySlot = Array.from(slotMap.entries()).map(([label, data]) => ({ label, ...data }));

  // Aggregate demand signals from recent history
  const cancelledCount = srRezs.filter(r => r.status === 'CANCELLED').length;
  const noShowCount = srRezs.filter(r => r.status === 'NO_SHOW').length;

  const input: PacingOptimizerInput = {
    venueName: venue.venue_name,
    date,
    dayOfWeek,
    currentShifts: shifts,
    currentOverrides: {
      covers_per_interval: venue.covers_per_interval,
      custom_pacing: venue.custom_pacing || {},
      interval_minutes: venue.interval_minutes,
      turn_time_overrides: venue.turn_time_overrides || {},
    },
    reservations: {
      totalCovers: srRezs.filter(r => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW')
        .reduce((s, r) => s + (r.max_guests || 0), 0),
      confirmed: srRezs.filter(r => r.status === 'CONFIRMED').length,
      pending: srRezs.filter(r => r.status === 'PENDING').length,
      cancelled: cancelledCount,
      bySlot,
    },
    historicalNoShowRate: noShowRate,
    historicalTurnTimes: historicalTurns,
    demandSignals: {
      cancellations: cancelledCount,
      noShows: noShowCount,
      walkIns: 0, // Not available from SR API
    },
    salesPace: salesData,
    utilization: {
      peakUtilizationPct: bySlot.length > 0
        ? Math.max(...bySlot.map(s => s.pacingLimit ? Math.round(s.coversBooked / s.pacingLimit * 100) : 0))
        : 0,
      avgTurnMinutes: Object.values(historicalTurns).length > 0
        ? Object.values(historicalTurns).reduce((a, b) => a + b, 0) / Object.values(historicalTurns).length
        : 90,
      lostRevenue: null,
    },
    widgetAccessRules: widgetAccessRules.length > 0 ? widgetAccessRules : null,
  };

  // Fetch native access rules (Phase 1: native rules take precedence when available)
  const nativeRules = await getActiveAccessRulesForDate(venue.venue_id, date).catch(() => []);
  if (nativeRules.length > 0) {
    input.nativeAccessRules = nativeRules;
  }

  // Run AI optimizer
  const output = await optimizePacing(input);

  // Store recommendations and auto-apply high-confidence ones on AI-managed rules
  let count = 0;
  for (const rec of output.recommendations) {
    const inserted = await insertRecommendation({
      org_id: orgId,
      venue_id: venue.venue_id,
      business_date: date,
      rec_type: rec.type,
      slot_label: rec.slot,
      current_value: { value: rec.currentValue },
      recommended_value: { value: rec.recommendedValue },
      reasoning: rec.reasoning,
      expected_impact: { extra_covers: rec.expectedImpact.extraCovers, revenue_delta: rec.expectedImpact.revenueDelta },
      confidence: rec.confidence,
    });
    if (inserted) count++;

    // Auto-apply: high-confidence recommendations on AI-managed native rules
    if (nativeRules.length > 0 && rec.confidence === 'high' && inserted) {
      const matchingRule = nativeRules.find(r =>
        r.ai_managed && (
          rec.type === 'covers' ||
          (rec.type === 'pacing' && rec.slot) ||
          (rec.type === 'turn_time') ||
          (rec.type === 'channel' && rec.channelRule && r.name === rec.channelRule)
        )
      );

      if (matchingRule) {
        const field = rec.type === 'covers' ? 'max_covers_per_interval'
          : rec.type === 'pacing' ? 'custom_pacing'
          : rec.type === 'turn_time' ? 'turn_times'
          : 'channel_allocation';

        let newValue: unknown = rec.recommendedValue;

        // For pacing/turn_time, merge with existing object
        if (rec.type === 'pacing' && rec.slot) {
          const match = rec.slot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (match) {
            let h = parseInt(match[1]);
            if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
            if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
            const key = `${h}:${match[2]}`;
            newValue = { ...matchingRule.custom_pacing, [key]: rec.recommendedValue };
          }
        } else if (rec.type === 'turn_time' && rec.slot) {
          newValue = { ...matchingRule.turn_times, [rec.slot]: rec.recommendedValue };
        }

        await aiAdjustAccessRule(
          matchingRule.id,
          field,
          rec.currentValue,
          newValue,
          rec.reasoning,
          'claude-sonnet-4-5-20250929',
          inserted.id,
        );

        // Mark recommendation as applied
        const { updateRecommendationStatus } = await import('@/lib/database/pacing-recommendations');
        await updateRecommendationStatus(inserted.id, 'applied');
      }
    }
  }

  return count;
}
