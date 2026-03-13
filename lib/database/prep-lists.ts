/**
 * Prep Lists — Forecast-driven prep task generation
 * Tells the kitchen WHAT to prep and HOW MUCH based on demand forecast.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────────────

export interface PrepList {
  id: string;
  venue_id: string;
  business_date: string;
  status: 'draft' | 'published' | 'in_progress' | 'completed';
  total_items: number;
  total_recipes: number;
  estimated_prep_minutes: number | null;
  covers_forecasted: number | null;
}

export interface PrepListItem {
  id: string;
  prep_list_id: string;
  recipe_id: string;
  recipe_name: string;
  prep_station_id: string | null;
  station_name?: string;
  forecasted_portions: number;
  on_hand_portions: number;
  prep_portions: number;
  batch_size: number | null;
  batches_needed: number | null;
  batch_uom: string | null;
  prep_priority: number;
  estimated_minutes: number | null;
  shelf_life_hours: number | null;
  prep_notes: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completed_by: string | null;
  completed_at: string | null;
  actual_portions: number | null;
}

// ── Generate Prep List ─────────────────────────────────────────────────

/**
 * Generate a prep list for a venue and business date.
 * Uses v_prep_forecast to compute what needs prepping.
 */
export async function generatePrepList(
  venueId: string,
  businessDate: string
): Promise<PrepList> {
  const supabase = getServiceClient();

  // Get forecast data
  const { data: forecast } = await (supabase as any)
    .from('v_prep_forecast')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .order('prep_priority', { ascending: true });

  if (!forecast?.length) {
    throw new Error(`No forecast data available for ${businessDate}`);
  }

  // Get forecasted covers for context
  const { data: demandForecast } = await (supabase as any)
    .from('demand_forecasts')
    .select('covers_predicted')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .order('forecast_date', { ascending: false })
    .limit(1)
    .single();

  // Calculate totals
  const totalMinutes = forecast.reduce(
    (sum: number, f: any) => sum + (f.total_estimated_minutes || 0), 0
  );

  // Create or update prep list
  const { data: prepList, error: plError } = await (supabase as any)
    .from('prep_lists')
    .upsert(
      {
        venue_id: venueId,
        business_date: businessDate,
        generated_by: 'system',
        total_items: forecast.length,
        total_recipes: new Set(forecast.map((f: any) => f.recipe_id)).size,
        estimated_prep_minutes: totalMinutes,
        covers_forecasted: demandForecast?.covers_predicted || null,
        status: 'draft',
      },
      { onConflict: 'venue_id,business_date' }
    )
    .select()
    .single();

  if (plError) throw new Error(`Failed to create prep list: ${plError.message}`);

  // Clear existing items (regenerating)
  await (supabase as any)
    .from('prep_list_items')
    .delete()
    .eq('prep_list_id', prepList.id)
    .eq('status', 'pending'); // only clear pending items

  // Insert prep items
  const items = forecast.map((f: any) => ({
    prep_list_id: prepList.id,
    recipe_id: f.recipe_id,
    recipe_name: f.recipe_name,
    prep_station_id: f.prep_station_id,
    forecasted_portions: f.forecasted_portions,
    on_hand_portions: 0, // TODO: could check leftover from previous day
    batch_size: f.batch_size,
    batches_needed: f.batches_needed,
    batch_uom: f.batch_uom,
    prep_priority: f.prep_priority || 50,
    estimated_minutes: f.total_estimated_minutes,
    shelf_life_hours: f.shelf_life_hours,
    prep_notes: f.prep_notes,
    status: 'pending',
  }));

  await (supabase as any).from('prep_list_items').insert(items);

  return prepList;
}

// ── Queries ────────────────────────────────────────────────────────────

export async function getPrepList(
  venueId: string,
  businessDate: string
): Promise<{ list: PrepList; items: PrepListItem[] } | null> {
  const supabase = getServiceClient();

  const { data: list } = await (supabase as any)
    .from('prep_lists')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .single();

  if (!list) return null;

  const { data: items } = await (supabase as any)
    .from('prep_list_items')
    .select('*, prep_stations(name)')
    .eq('prep_list_id', list.id)
    .order('prep_priority', { ascending: true });

  return {
    list,
    items: (items || []).map((i: any) => ({
      ...i,
      station_name: i.prep_stations?.name,
    })),
  };
}

export async function getPrepListByStation(
  venueId: string,
  businessDate: string
): Promise<Record<string, PrepListItem[]>> {
  const result = await getPrepList(venueId, businessDate);
  if (!result) return {};

  const byStation: Record<string, PrepListItem[]> = {};
  for (const item of result.items) {
    const station = item.station_name || 'General';
    if (!byStation[station]) byStation[station] = [];
    byStation[station].push(item);
  }
  return byStation;
}

// ── Completion Tracking ────────────────────────────────────────────────

export async function completePrepItem(
  itemId: string,
  completedBy: string,
  actualPortions?: number,
  notes?: string
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('prep_list_items')
    .update({
      status: 'completed',
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      actual_portions: actualPortions,
      completion_notes: notes,
    })
    .eq('id', itemId);

  if (error) throw new Error(`Failed to complete prep item: ${error.message}`);
}

export async function skipPrepItem(
  itemId: string,
  completedBy: string,
  reason: string
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('prep_list_items')
    .update({
      status: 'skipped',
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      completion_notes: reason,
    })
    .eq('id', itemId);

  if (error) throw new Error(`Failed to skip prep item: ${error.message}`);
}

export async function publishPrepList(listId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('prep_lists')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', listId);

  if (error) throw new Error(`Failed to publish prep list: ${error.message}`);
}

export async function getPrepCompletionStats(
  venueId: string,
  businessDate: string
): Promise<any> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('v_prep_completion_stats')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .single();

  if (error) return null;
  return data;
}
