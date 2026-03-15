/**
 * Comp Set Database Layer
 *
 * Data access for competitor venue tracking and price position analysis.
 * Separated from menu-agent.ts because comp set data could serve
 * multiple agents in the future (beverage pricing, event pricing, etc.).
 */

import { getServiceClient } from '@/lib/supabase/service';
import { shouldSilenceMissingRelationError } from '@/lib/database/schema-guards';

// ── Types ──────────────────────────────────────────────────────

export interface CompSetVenue {
  id: string;
  venue_id: string;
  org_id: string;
  comp_venue_name: string;
  comp_venue_address: string | null;
  source_url: string | null;
  platform: string | null;
  last_scraped_at: string | null;
  scrape_status: string;
  is_active: boolean;
}

export interface CompSetItem {
  id: string;
  comp_set_venue_id: string;
  item_name: string;
  item_category: string | null;
  item_description: string | null;
  price: number | null;
  previous_price: number | null;
  price_changed_at: string | null;
  matched_recipe_id: string | null;
  match_confidence: number | null;
  last_seen_at: string;
}

export interface CompSetPricePosition {
  recipe_id: string;
  recipe_name: string;
  our_price: number;
  comp_prices: Array<{
    comp_venue_name: string;
    item_name: string;
    price: number;
    confidence: number;
  }>;
  comp_low: number;
  comp_median: number;
  comp_high: number;
  our_position: 'below' | 'at' | 'above';
  headroom: number; // positive = room to increase
}

// ── Comp Set Venues ──────────────────────────────────────────

export async function getCompSetVenues(venueId: string): Promise<CompSetVenue[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('comp_set_venues')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('comp_venue_name');

  if (error) {
    if (shouldSilenceMissingRelationError('comp-set', 'comp_set_venues', error)) {
      return [];
    }
    console.error('[CompSet] Error fetching venues:', error.message);
    return [];
  }

  return (data || []) as CompSetVenue[];
}

export async function upsertCompSetVenue(params: {
  venue_id: string;
  org_id: string;
  comp_venue_name: string;
  comp_venue_address?: string;
  source_url?: string;
  platform?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('comp_set_venues')
    .upsert(
      {
        venue_id: params.venue_id,
        org_id: params.org_id,
        comp_venue_name: params.comp_venue_name,
        comp_venue_address: params.comp_venue_address || null,
        source_url: params.source_url || null,
        platform: params.platform || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id,comp_venue_name' }
    )
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateScrapeStatus(
  compVenueId: string,
  status: 'pending' | 'success' | 'failed' | 'no_menu_found'
): Promise<void> {
  const supabase = getServiceClient();

  const update: Record<string, unknown> = { scrape_status: status };
  if (status === 'success') {
    update.last_scraped_at = new Date().toISOString();
  }

  await (supabase as any)
    .from('comp_set_venues')
    .update(update)
    .eq('id', compVenueId);
}

// ── Comp Set Items ──────────────────────────────────────────

export async function getCompSetItems(compVenueId: string): Promise<CompSetItem[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('comp_set_items')
    .select('*')
    .eq('comp_set_venue_id', compVenueId)
    .order('item_category', { ascending: true });

  return (data || []) as CompSetItem[];
}

export async function upsertCompSetItems(
  compVenueId: string,
  items: Array<{
    item_name: string;
    item_category?: string;
    item_description?: string;
    price?: number;
  }>
): Promise<{ success: boolean; count: number; price_changes: number }> {
  if (items.length === 0) return { success: true, count: 0, price_changes: 0 };

  const supabase = getServiceClient();
  const now = new Date().toISOString();
  let priceChanges = 0;

  // Fetch existing items to detect price changes
  const { data: existing } = await (supabase as any)
    .from('comp_set_items')
    .select('item_name, price')
    .eq('comp_set_venue_id', compVenueId);

  const existingPrices = new Map(
    (existing || []).map((e: any) => [e.item_name, e.price])
  );

  const rows = items.map((item) => {
    const oldPrice = existingPrices.get(item.item_name);
    const hasChanged = oldPrice != null && item.price != null && oldPrice !== item.price;
    if (hasChanged) priceChanges++;

    return {
      comp_set_venue_id: compVenueId,
      item_name: item.item_name,
      item_category: item.item_category || null,
      item_description: item.item_description || null,
      price: item.price ?? null,
      previous_price: hasChanged ? oldPrice : undefined,
      price_changed_at: hasChanged ? now : undefined,
      last_seen_at: now,
      updated_at: now,
    };
  });

  const { error } = await (supabase as any)
    .from('comp_set_items')
    .upsert(rows, { onConflict: 'comp_set_venue_id,item_name' });

  if (error) {
    console.error('[CompSet] Error upserting items:', error.message);
    return { success: false, count: 0, price_changes: 0 };
  }

  return { success: true, count: rows.length, price_changes: priceChanges };
}

export async function getUnmatchedCompSetItems(
  venueId: string
): Promise<Array<CompSetItem & { comp_venue_name: string }>> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('comp_set_items')
    .select('*, comp_set_venues!inner(venue_id, comp_venue_name)')
    .is('matched_recipe_id', null)
    .eq('comp_set_venues.venue_id', venueId)
    .eq('comp_set_venues.is_active', true);

  return (data || []).map((d: any) => ({
    ...d,
    comp_venue_name: d.comp_set_venues?.comp_venue_name,
  }));
}

export async function updateCompSetItemMatch(
  itemId: string,
  matchedRecipeId: string,
  confidence: number
): Promise<void> {
  const supabase = getServiceClient();

  await (supabase as any)
    .from('comp_set_items')
    .update({
      matched_recipe_id: matchedRecipeId,
      match_confidence: confidence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId);
}

// ── Price Position Analysis ──────────────────────────────────

export async function getCompSetPriceMap(
  venueId: string,
  recipeId?: string
): Promise<CompSetPricePosition[]> {
  const supabase = getServiceClient();

  // Get all matched comp items for this venue's comp set
  let query = (supabase as any)
    .from('comp_set_items')
    .select('*, comp_set_venues!inner(venue_id, comp_venue_name)')
    .not('matched_recipe_id', 'is', null)
    .not('price', 'is', null)
    .eq('comp_set_venues.venue_id', venueId)
    .eq('comp_set_venues.is_active', true);

  if (recipeId) {
    query = query.eq('matched_recipe_id', recipeId);
  }

  const { data: compItems } = await query;
  if (!compItems || compItems.length === 0) return [];

  // Get our recipes
  const recipeIds = [...new Set(compItems.map((c: any) => c.matched_recipe_id))];
  const { data: recipes } = await (supabase as any)
    .from('recipes')
    .select('id, name, menu_price')
    .in('id', recipeIds)
    .is('effective_to', null);

  if (!recipes) return [];

  const recipeMap = new Map<string, any>(recipes.map((r: any) => [r.id, r]));

  // Group by recipe
  const grouped = new Map<string, any[]>();
  for (const item of compItems) {
    const rid = item.matched_recipe_id;
    if (!grouped.has(rid)) grouped.set(rid, []);
    grouped.get(rid)!.push(item);
  }

  const positions: CompSetPricePosition[] = [];

  for (const [rid, items] of grouped) {
    const recipe = recipeMap.get(rid);
    if (!recipe || !recipe.menu_price) continue;

    const prices = items
      .map((i: any) => i.price)
      .filter((p: number) => p > 0)
      .sort((a: number, b: number) => a - b);

    if (prices.length === 0) continue;

    const median = prices[Math.floor(prices.length / 2)];
    const ourPrice = recipe.menu_price;

    positions.push({
      recipe_id: rid,
      recipe_name: recipe.name,
      our_price: ourPrice,
      comp_prices: items.map((i: any) => ({
        comp_venue_name: i.comp_set_venues?.comp_venue_name || 'Unknown',
        item_name: i.item_name,
        price: i.price,
        confidence: i.match_confidence || 0,
      })),
      comp_low: prices[0],
      comp_median: median,
      comp_high: prices[prices.length - 1],
      our_position: ourPrice < median * 0.95 ? 'below' : ourPrice > median * 1.05 ? 'above' : 'at',
      headroom: Math.round((median - ourPrice) * 100) / 100,
    });
  }

  return positions.sort((a, b) => b.headroom - a.headroom);
}

/**
 * Detect recent competitor price changes (leading indicators).
 */
export async function getCompSetPriceChanges(
  venueId: string,
  sinceDays: number = 30
): Promise<any[]> {
  const supabase = getServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const { data } = await (supabase as any)
    .from('comp_set_items')
    .select('*, comp_set_venues!inner(venue_id, comp_venue_name)')
    .not('previous_price', 'is', null)
    .not('price_changed_at', 'is', null)
    .gte('price_changed_at', since.toISOString())
    .eq('comp_set_venues.venue_id', venueId)
    .eq('comp_set_venues.is_active', true)
    .order('price_changed_at', { ascending: false });

  return (data || []).map((d: any) => ({
    ...d,
    comp_venue_name: d.comp_set_venues?.comp_venue_name,
    change_pct:
      d.previous_price > 0
        ? Math.round(((d.price - d.previous_price) / d.previous_price) * 10000) / 100
        : null,
  }));
}

/**
 * Get venues due for a comp set scan.
 */
export async function getVenuesDueForCompSetScan(
  frequencyDays: number = 14
): Promise<CompSetVenue[]> {
  const supabase = getServiceClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - frequencyDays);

  const { data } = await (supabase as any)
    .from('comp_set_venues')
    .select('*')
    .eq('is_active', true)
    .or(`last_scraped_at.is.null,last_scraped_at.lt.${cutoff.toISOString()}`);

  return (data || []) as CompSetVenue[];
}
