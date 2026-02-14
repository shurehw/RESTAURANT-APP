/**
 * Inventory Exception Detectors
 *
 * Five detectors that query existing inventory/procurement tables
 * to find anomalies. Pure read — no side effects.
 *
 * Detectors:
 *   1. Cost spikes (z-score on item_cost_history)
 *   2. Unresolved invoice variances
 *   3. Inventory shrink (physical count vs perpetual balance)
 *   4. Recipe cost drift (snapshot comparison)
 *   5. Par level violations (items below reorder point)
 */

import { getServiceClient } from '@/lib/supabase/service';
import type { ProcurementSettings } from './procurement-settings';

// ── Default Thresholds ────────────────────────────────────────

export const PROCUREMENT_DEFAULTS = {
  COST_SPIKE_Z_THRESHOLD: 2.0,
  COST_SPIKE_LOOKBACK_DAYS: 90,
  COST_SPIKE_MIN_HISTORY: 5,
  SHRINK_COST_WARNING: 500,
  SHRINK_COST_CRITICAL: 2000,
  RECIPE_DRIFT_WARNING_PCT: 10,
  RECIPE_DRIFT_CRITICAL_PCT: 20,
  RECIPE_DRIFT_LOOKBACK_DAYS: 30,
};

// ── Types ──────────────────────────────────────────────────────

export interface CostSpikeException {
  item_id: string;
  item_name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  venue_id: string;
  new_cost: number;
  avg_cost: number;
  std_dev: number;
  z_score: number;
  variance_pct: number;
  source: string;
  source_id: string | null;
  effective_date: string;
}

export interface InvoiceVarianceException {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  venue_id: string;
  vendor_id: string;
  vendor_name: string;
  variance_type: string;
  severity: string;
  line_count: number;
  total_variance_amount: number;
  variance_pct: number;
  invoice_date: string;
}

export interface ShrinkItem {
  item_id: string;
  item_name: string;
  expected_qty: number;
  counted_qty: number;
  unit_cost: number;
  shrink_cost: number;
}

export interface InventoryShrinkException {
  count_id: string;
  venue_id: string;
  count_date: string;
  total_shrink_cost: number;
  total_counted_value: number;
  shrink_pct: number;
  high_shrink_items: ShrinkItem[];
}

export interface RecipeCostDriftException {
  recipe_id: string;
  recipe_name: string;
  venue_id: string | null;
  current_cost: number;
  previous_cost: number;
  drift_pct: number;
  last_calculated_at: string;
}

export interface ParLevelViolationException {
  item_id: string;
  item_name: string;
  sku: string | null;
  venue_id: string;
  quantity_on_hand: number;
  reorder_point: number;
  par_level: number;
  deficit: number;
  estimated_order_cost: number;
}

export interface InventoryExceptionResults {
  cost_spikes: CostSpikeException[];
  invoice_variances: InvoiceVarianceException[];
  shrink_exceptions: InventoryShrinkException[];
  recipe_drift: RecipeCostDriftException[];
  par_violations: ParLevelViolationException[];
}

// ── 1. Cost Spike Detection ─────────────────────────────────────

/**
 * Detect cost spikes by computing z-scores on recent item_cost_history entries.
 * Fetches entries from the last 24 hours, compares against 90-day historical stats.
 */
export async function detectCostSpikes(
  venueId: string,
  businessDate: string,
  options?: {
    zThreshold?: number;
    lookbackDays?: number;
    minHistory?: number;
  }
): Promise<CostSpikeException[]> {
  const supabase = getServiceClient();
  const zThreshold = options?.zThreshold ?? PROCUREMENT_DEFAULTS.COST_SPIKE_Z_THRESHOLD;
  const lookbackDays = options?.lookbackDays ?? PROCUREMENT_DEFAULTS.COST_SPIKE_LOOKBACK_DAYS;
  const minHistory = options?.minHistory ?? PROCUREMENT_DEFAULTS.COST_SPIKE_MIN_HISTORY;

  // Fetch cost entries from the last 24 hours for this venue
  const oneDayAgo = new Date(businessDate);
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);

  const { data: recentCosts, error: recentErr } = await (supabase as any)
    .from('item_cost_history')
    .select(`
      id,
      item_id,
      vendor_id,
      venue_id,
      cost,
      effective_date,
      source,
      source_id
    `)
    .eq('venue_id', venueId)
    .gte('effective_date', oneDayAgo.toISOString())
    .lte('effective_date', new Date(businessDate + 'T23:59:59Z').toISOString());

  if (recentErr || !recentCosts || recentCosts.length === 0) {
    return [];
  }

  // Get unique item IDs from recent costs
  const itemIds = [...new Set(recentCosts.map((r: any) => r.item_id))] as string[];

  // Fetch item names
  const { data: items } = await (supabase as any)
    .from('items')
    .select('id, name')
    .in('id', itemIds);

  const itemMap = new Map<string, string>();
  for (const item of items || []) {
    itemMap.set(item.id, item.name);
  }

  // Fetch vendor names for vendor IDs present
  const vendorIds = [...new Set(recentCosts.filter((r: any) => r.vendor_id).map((r: any) => r.vendor_id))] as string[];
  const vendorMap = new Map<string, string>();
  if (vendorIds.length > 0) {
    const { data: vendors } = await (supabase as any)
      .from('vendors')
      .select('id, name')
      .in('id', vendorIds);
    for (const v of vendors || []) {
      vendorMap.set(v.id, v.name);
    }
  }

  // For each recent cost entry, compute z-score against historical data
  const lookbackDate = new Date(businessDate);
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  const spikes: CostSpikeException[] = [];

  // Group recent costs by item to avoid redundant history queries
  const byItem = new Map<string, any[]>();
  for (const entry of recentCosts) {
    const list = byItem.get(entry.item_id) || [];
    list.push(entry);
    byItem.set(entry.item_id, list);
  }

  for (const [itemId, entries] of byItem) {
    // Fetch historical stats (excluding today's entries)
    const { data: history } = await (supabase as any)
      .from('item_cost_history')
      .select('cost')
      .eq('item_id', itemId)
      .gte('effective_date', lookbackDate.toISOString())
      .lt('effective_date', oneDayAgo.toISOString());

    if (!history || history.length < minHistory) continue;

    const costs = history.map((h: any) => Number(h.cost));
    const avg = costs.reduce((a: number, b: number) => a + b, 0) / costs.length;
    const variance = costs.reduce((a: number, b: number) => a + Math.pow(b - avg, 2), 0) / costs.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) continue; // No variance in history — can't compute z-score

    for (const entry of entries) {
      const newCost = Number(entry.cost);
      const zScore = (newCost - avg) / stdDev;

      if (Math.abs(zScore) >= zThreshold) {
        spikes.push({
          item_id: itemId,
          item_name: itemMap.get(itemId) || 'Unknown Item',
          vendor_id: entry.vendor_id,
          vendor_name: entry.vendor_id ? vendorMap.get(entry.vendor_id) || null : null,
          venue_id: venueId,
          new_cost: newCost,
          avg_cost: avg,
          std_dev: stdDev,
          z_score: zScore,
          variance_pct: avg > 0 ? ((newCost - avg) / avg) * 100 : 0,
          source: entry.source || 'unknown',
          source_id: entry.source_id,
          effective_date: entry.effective_date,
        });
      }
    }
  }

  return spikes;
}

// ── 2. Invoice Variance Detection ───────────────────────────────

/**
 * Fetch unresolved invoice variances at or above warning severity.
 */
export async function detectInvoiceVariances(
  venueId: string
): Promise<InvoiceVarianceException[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('invoice_variances')
    .select(`
      id,
      invoice_id,
      variance_type,
      severity,
      line_count,
      total_variance_amount,
      variance_pct,
      invoices!inner (
        invoice_number,
        invoice_date,
        venue_id,
        vendor_id,
        vendors ( name )
      )
    `)
    .eq('invoices.venue_id', venueId)
    .eq('resolved', false)
    .in('severity', ['warning', 'critical']);

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    invoice_id: row.invoice_id,
    invoice_number: row.invoices?.invoice_number || null,
    venue_id: venueId,
    vendor_id: row.invoices?.vendor_id || '',
    vendor_name: row.invoices?.vendors?.name || 'Unknown Vendor',
    variance_type: row.variance_type,
    severity: row.severity,
    line_count: row.line_count || 0,
    total_variance_amount: Number(row.total_variance_amount) || 0,
    variance_pct: Number(row.variance_pct) || 0,
    invoice_date: row.invoices?.invoice_date || '',
  }));
}

// ── 3. Inventory Shrink Detection ───────────────────────────────

/**
 * Detect shrink from recent approved inventory counts.
 * Compares counted quantities against perpetual balance (inventory_balances).
 *
 * Note: inventory_count_lines (migration 009) does NOT have shrink_cost
 * or expected_qty columns. We compute shrink by joining to inventory_balances.
 */
export async function detectInventoryShrink(
  venueId: string,
  businessDate: string,
  options?: {
    lookbackDays?: number;
    costWarning?: number;
  }
): Promise<InventoryShrinkException[]> {
  const supabase = getServiceClient();
  const lookbackDays = options?.lookbackDays ?? 7;
  const costWarning = options?.costWarning ?? PROCUREMENT_DEFAULTS.SHRINK_COST_WARNING;

  const lookbackDate = new Date(businessDate);
  lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

  // Fetch approved counts in the window
  const { data: counts, error: countErr } = await (supabase as any)
    .from('inventory_counts')
    .select('id, venue_id, count_date')
    .eq('venue_id', venueId)
    .eq('status', 'approved')
    .gte('count_date', lookbackDate.toISOString().split('T')[0])
    .lte('count_date', businessDate);

  if (countErr || !counts || counts.length === 0) return [];

  const exceptions: InventoryShrinkException[] = [];

  for (const count of counts) {
    // Fetch count lines with item details and balance
    const { data: lines } = await (supabase as any)
      .from('inventory_count_lines')
      .select(`
        item_id,
        quantity_counted,
        unit_cost,
        items ( name )
      `)
      .eq('count_id', count.id);

    if (!lines || lines.length === 0) continue;

    // Fetch balances for items in this count
    const lineItemIds = lines.map((l: any) => l.item_id);
    const { data: balances } = await (supabase as any)
      .from('inventory_balances')
      .select('item_id, quantity_on_hand')
      .eq('venue_id', venueId)
      .in('item_id', lineItemIds);

    const balanceMap = new Map<string, number>();
    for (const b of balances || []) {
      balanceMap.set(b.item_id, Number(b.quantity_on_hand) || 0);
    }

    // Calculate shrink per item
    const shrinkItems: ShrinkItem[] = [];
    let totalShrinkCost = 0;
    let totalCountedValue = 0;

    for (const line of lines) {
      const counted = Number(line.quantity_counted) || 0;
      const expected = balanceMap.get(line.item_id) ?? counted; // fallback to counted if no balance
      const unitCost = Number(line.unit_cost) || 0;
      const shrinkQty = expected - counted;
      const shrinkCost = shrinkQty * unitCost;

      totalCountedValue += counted * unitCost;

      if (shrinkCost > 0) {
        totalShrinkCost += shrinkCost;
        shrinkItems.push({
          item_id: line.item_id,
          item_name: line.items?.name || 'Unknown',
          expected_qty: expected,
          counted_qty: counted,
          unit_cost: unitCost,
          shrink_cost: shrinkCost,
        });
      }
    }

    if (totalShrinkCost >= costWarning) {
      // Sort by highest shrink cost
      shrinkItems.sort((a, b) => b.shrink_cost - a.shrink_cost);

      exceptions.push({
        count_id: count.id,
        venue_id: venueId,
        count_date: count.count_date,
        total_shrink_cost: totalShrinkCost,
        total_counted_value: totalCountedValue,
        shrink_pct: totalCountedValue > 0 ? (totalShrinkCost / totalCountedValue) * 100 : 0,
        high_shrink_items: shrinkItems.slice(0, 10), // top 10
      });
    }
  }

  return exceptions;
}

// ── 4. Recipe Cost Drift Detection ──────────────────────────────

/**
 * Detect recipes whose cost has drifted significantly.
 * Compares the two most recent recipe_costs snapshots per recipe.
 * Requires snapshots to be >lookbackDays apart to avoid false positives.
 */
export async function detectRecipeCostDrift(
  venueId: string | null,
  options?: {
    driftWarningPct?: number;
    lookbackDays?: number;
  }
): Promise<RecipeCostDriftException[]> {
  const supabase = getServiceClient();
  const driftWarningPct = options?.driftWarningPct ?? PROCUREMENT_DEFAULTS.RECIPE_DRIFT_WARNING_PCT;
  const lookbackDays = options?.lookbackDays ?? PROCUREMENT_DEFAULTS.RECIPE_DRIFT_LOOKBACK_DAYS;

  // Fetch the two most recent snapshots per recipe using a window function approach
  // Since Supabase JS doesn't support window functions, we'll do two queries
  let recipeQuery = (supabase as any)
    .from('recipes')
    .select('id, name, venue_id, cost_per_unit')
    .eq('is_active', true);

  if (venueId) {
    recipeQuery = recipeQuery.eq('venue_id', venueId);
  }

  const { data: recipes, error: recipeErr } = await recipeQuery;

  if (recipeErr || !recipes || recipes.length === 0) return [];

  const recipeIds = recipes.map((r: any) => r.id);
  const recipeMap = new Map<string, any>();
  for (const r of recipes) {
    recipeMap.set(r.id, r);
  }

  // Fetch recent cost snapshots
  const { data: costSnapshots } = await (supabase as any)
    .from('recipe_costs')
    .select('recipe_id, total_cost, cost_per_serving, calculated_at, venue_id')
    .in('recipe_id', recipeIds)
    .order('calculated_at', { ascending: false });

  if (!costSnapshots || costSnapshots.length === 0) return [];

  // Group by recipe, take 2 most recent
  const byRecipe = new Map<string, any[]>();
  for (const snap of costSnapshots) {
    const list = byRecipe.get(snap.recipe_id) || [];
    if (list.length < 2) {
      list.push(snap);
    }
    byRecipe.set(snap.recipe_id, list);
  }

  const exceptions: RecipeCostDriftException[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  for (const [recipeId, snapshots] of byRecipe) {
    if (snapshots.length < 2) continue;

    const current = snapshots[0];
    const previous = snapshots[1];

    // Only flag if previous snapshot is old enough
    if (new Date(previous.calculated_at) > cutoffDate) continue;

    const currentCost = Number(current.total_cost) || 0;
    const previousCost = Number(previous.total_cost) || 0;

    if (previousCost === 0) continue;

    const driftPct = ((currentCost - previousCost) / previousCost) * 100;

    if (Math.abs(driftPct) >= driftWarningPct) {
      const recipe = recipeMap.get(recipeId);
      exceptions.push({
        recipe_id: recipeId,
        recipe_name: recipe?.name || 'Unknown Recipe',
        venue_id: recipe?.venue_id || current.venue_id || null,
        current_cost: currentCost,
        previous_cost: previousCost,
        drift_pct: driftPct,
        last_calculated_at: current.calculated_at,
      });
    }
  }

  return exceptions;
}

// ── 5. Par Level Violation Detection ────────────────────────────

/**
 * Detect items below their reorder point using the existing view.
 */
export async function detectParViolations(
  venueId: string
): Promise<ParLevelViolationException[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('items_below_reorder')
    .select('*')
    .eq('venue_id', venueId);

  if (error || !data) return [];

  return data.map((row: any) => ({
    item_id: row.item_id,
    item_name: row.item_name || 'Unknown',
    sku: row.sku || null,
    venue_id: row.venue_id,
    quantity_on_hand: Number(row.quantity_on_hand) || 0,
    reorder_point: Number(row.reorder_point) || 0,
    par_level: Number(row.par_level) || 0,
    deficit: (Number(row.reorder_point) || 0) - (Number(row.quantity_on_hand) || 0),
    estimated_order_cost: Number(row.estimated_order_cost) || 0,
  }));
}

// ── Orchestrator ────────────────────────────────────────────────

/**
 * Run all 5 detectors for a venue. Returns combined results.
 * Accepts optional org-level settings; falls back to PROCUREMENT_DEFAULTS.
 */
export async function detectAllInventoryExceptions(
  venueId: string,
  businessDate: string,
  settings?: ProcurementSettings
): Promise<InventoryExceptionResults> {
  const [costSpikes, invoiceVariances, shrinkExceptions, recipeDrift, parViolations] =
    await Promise.allSettled([
      detectCostSpikes(venueId, businessDate, settings ? {
        zThreshold: settings.cost_spike_z_threshold,
        lookbackDays: settings.cost_spike_lookback_days,
        minHistory: settings.cost_spike_min_history,
      } : undefined),
      detectInvoiceVariances(venueId),
      detectInventoryShrink(venueId, businessDate, settings ? {
        costWarning: settings.shrink_cost_warning,
      } : undefined),
      detectRecipeCostDrift(venueId, settings ? {
        driftWarningPct: settings.recipe_drift_warning_pct,
        lookbackDays: settings.recipe_drift_lookback_days,
      } : undefined),
      detectParViolations(venueId),
    ]);

  return {
    cost_spikes: costSpikes.status === 'fulfilled' ? costSpikes.value : [],
    invoice_variances: invoiceVariances.status === 'fulfilled' ? invoiceVariances.value : [],
    shrink_exceptions: shrinkExceptions.status === 'fulfilled' ? shrinkExceptions.value : [],
    recipe_drift: recipeDrift.status === 'fulfilled' ? recipeDrift.value : [],
    par_violations: parViolations.status === 'fulfilled' ? parViolations.value : [],
  };
}
