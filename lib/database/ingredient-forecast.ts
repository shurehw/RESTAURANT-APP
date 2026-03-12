/**
 * Ingredient Demand Forecast — Connects covers forecast to recipe BOM
 * Predicts ingredient consumption and surfaces net needs.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────────────

export interface IngredientForecast {
  venue_id: string;
  business_date: string;
  item_id: string;
  item_name: string;
  item_category: string;
  uom: string;
  forecasted_qty: number;
  forecasted_cost: number;
  lead_time_days: number;
}

export interface IngredientNeed {
  venue_id: string;
  item_id: string;
  item_name: string;
  item_category: string;
  uom: string;
  lead_time_days: number;
  total_forecasted_qty: number;
  total_forecasted_cost: number;
  on_hand_qty: number;
  net_need_qty: number;
  par_level: number;
  reorder_point: number;
  reorder_quantity: number;
  below_reorder: boolean;
  urgency: 'critical' | 'warning' | 'ok';
  first_need_date: string;
  last_need_date: string;
  forecast_days: number;
}

// ── Queries ────────────────────────────────────────────────────────────

/**
 * Get ingredient-level demand forecast for a venue over a date range.
 */
export async function getIngredientDemandForecast(
  venueId: string,
  horizonDays = 7
): Promise<IngredientForecast[]> {
  const supabase = getServiceClient();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + horizonDays);

  const { data, error } = await (supabase as any)
    .from('v_ingredient_demand_forecast')
    .select('*')
    .eq('venue_id', venueId)
    .gte('business_date', new Date().toISOString().split('T')[0])
    .lte('business_date', endDate.toISOString().split('T')[0])
    .order('business_date');

  if (error) throw new Error(`Failed to fetch ingredient forecast: ${error.message}`);
  return data || [];
}

/**
 * Get net ingredient needs (forecast minus on-hand) for a venue.
 * This is the primary input for auto PO generation.
 */
export async function getIngredientNeeds(
  venueId: string,
  urgencyFilter?: 'critical' | 'warning'
): Promise<IngredientNeed[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('v_ingredient_needs_summary')
    .select('*')
    .eq('venue_id', venueId)
    .gt('net_need_qty', 0)
    .order('urgency', { ascending: true });

  if (urgencyFilter) {
    query = query.eq('urgency', urgencyFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch ingredient needs: ${error.message}`);
  return data || [];
}

/**
 * Get ingredient forecast grouped by day for a specific item.
 * Useful for seeing demand curve over time.
 */
export async function getItemDemandCurve(
  venueId: string,
  itemId: string,
  horizonDays = 14
): Promise<IngredientForecast[]> {
  const supabase = getServiceClient();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + horizonDays);

  const { data, error } = await (supabase as any)
    .from('v_ingredient_demand_forecast')
    .select('*')
    .eq('venue_id', venueId)
    .eq('item_id', itemId)
    .gte('business_date', new Date().toISOString().split('T')[0])
    .lte('business_date', endDate.toISOString().split('T')[0])
    .order('business_date');

  if (error) throw new Error(`Failed to fetch item demand curve: ${error.message}`);
  return data || [];
}

/**
 * Refresh the item mix ratios materialized view.
 * Should be run weekly or on-demand after significant menu changes.
 */
export async function refreshItemMixRatios(): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any).rpc('refresh_item_mix_ratios');
  if (error) throw new Error(`Failed to refresh mix ratios: ${error.message}`);
}
