/**
 * Auto PO Generator — Demand-driven purchase order creation
 * Combines par-based and forecast-based needs, consolidates by vendor,
 * respects MOQ/price tiers, and creates draft POs for approval.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getIngredientNeeds } from './ingredient-forecast';

// ── Types ──────────────────────────────────────────────────────────────

export interface AutoPOSettings {
  auto_po_enabled: boolean;
  auto_po_mode: 'par' | 'forecast' | 'both';
  auto_po_forecast_horizon_days: number;
  auto_po_requires_approval: boolean;
  auto_po_min_order_value: number;
  auto_po_consolidate_vendors: boolean;
}

export interface OrderLineItem {
  item_id: string;
  item_name: string;
  order_qty: number;
  unit_price: number;
  vendor_id: string;
  vendor_name: string;
  need_source: 'par' | 'forecast' | 'both';
  moq: number;
}

export interface GenerationResult {
  run_id: string;
  pos_generated: number;
  items_evaluated: number;
  items_needing_order: number;
  total_estimated_cost: number;
  po_ids: string[];
  skipped_below_minimum: number;
}

// ── Core Generator ─────────────────────────────────────────────────────

export async function generateAutoPurchaseOrders(
  venueId: string,
  triggeredBy: 'cron' | 'manual' | 'par_alert' = 'manual',
  createdBy?: string
): Promise<GenerationResult> {
  const supabase = getServiceClient();

  // 1. Get settings
  const { data: venue } = await (supabase as any)
    .from('venues')
    .select('organization_id')
    .eq('id', venueId)
    .single();

  if (!venue) throw new Error(`Venue ${venueId} not found`);

  const { data: settings } = await (supabase as any)
    .from('procurement_settings')
    .select('*')
    .eq('org_id', venue.organization_id)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (!settings?.auto_po_enabled) {
    throw new Error('Auto PO generation is not enabled for this organization');
  }

  // 2. Gather needs based on mode
  const needMap = new Map<string, OrderLineItem>();
  let itemsEvaluated = 0;

  // Par-based needs
  if (settings.auto_po_mode === 'par' || settings.auto_po_mode === 'both') {
    const { data: parNeeds } = await (supabase as any)
      .from('items_below_reorder')
      .select('*')
      .eq('venue_id', venueId);

    for (const item of parNeeds || []) {
      itemsEvaluated++;
      const orderQty = Math.max(item.reorder_quantity || 0, (item.par_level || 0) - (item.quantity_on_hand || 0));
      if (orderQty > 0) {
        needMap.set(item.item_id, {
          item_id: item.item_id,
          item_name: item.item_name,
          order_qty: orderQty,
          unit_price: item.estimated_order_cost / Math.max(orderQty, 1),
          vendor_id: '',
          vendor_name: '',
          need_source: 'par',
          moq: 1,
        });
      }
    }
  }

  // Forecast-based needs
  if (settings.auto_po_mode === 'forecast' || settings.auto_po_mode === 'both') {
    const forecastNeeds = await getIngredientNeeds(venueId);
    for (const need of forecastNeeds) {
      itemsEvaluated++;
      const existing = needMap.get(need.item_id);
      if (existing) {
        // Take the larger of par vs forecast qty
        existing.order_qty = Math.max(existing.order_qty, need.net_need_qty);
        existing.need_source = 'both';
      } else if (need.net_need_qty > 0) {
        needMap.set(need.item_id, {
          item_id: need.item_id,
          item_name: need.item_name,
          order_qty: need.net_need_qty,
          unit_price: need.total_forecasted_cost / Math.max(need.net_need_qty, 1),
          vendor_id: '',
          vendor_name: '',
          need_source: 'forecast',
          moq: 1,
        });
      }
    }
  }

  // 3. Look up best vendor/pricing for each item
  for (const [itemId, line] of needMap) {
    const { data: vendorItems } = await (supabase as any)
      .from('vendor_items')
      .select('*, vendors(id, name)')
      .eq('item_id', itemId)
      .eq('is_active', true)
      .order('tier_price', { ascending: true });

    if (vendorItems?.length) {
      // Find best price tier that meets quantity
      const best = vendorItems.find((vi: any) => line.order_qty >= vi.tier_qty) || vendorItems[0];
      line.vendor_id = best.vendor_id;
      line.vendor_name = best.vendors?.name || '';
      line.unit_price = best.tier_price;
      line.moq = best.moq || 1;
      // Enforce MOQ
      if (line.order_qty < line.moq) {
        line.order_qty = line.moq;
      }
    }
  }

  // 4. Group by vendor
  const vendorGroups = new Map<string, OrderLineItem[]>();
  for (const line of needMap.values()) {
    if (!line.vendor_id) continue; // skip items with no vendor
    const key = settings.auto_po_consolidate_vendors ? line.vendor_id : `${line.vendor_id}_${line.item_id}`;
    const group = vendorGroups.get(key) || [];
    group.push(line);
    vendorGroups.set(key, group);
  }

  // 5. Create POs
  const poIds: string[] = [];
  let skippedBelowMinimum = 0;
  const minValue = settings.auto_po_min_order_value || 0;
  const generationType = settings.auto_po_mode === 'both' ? 'auto_both' :
    settings.auto_po_mode === 'par' ? 'auto_par' : 'auto_forecast';

  // Create generation run first
  const { data: run } = await (supabase as any)
    .from('po_generation_runs')
    .insert({
      venue_id: venueId,
      generation_type: settings.auto_po_mode,
      triggered_by: triggeredBy,
      items_evaluated: itemsEvaluated,
      items_needing_order: needMap.size,
      created_by: createdBy,
    })
    .select('id')
    .single();

  for (const [vendorKey, lines] of vendorGroups) {
    const totalValue = lines.reduce((sum, l) => sum + l.order_qty * l.unit_price, 0);

    if (totalValue < minValue) {
      skippedBelowMinimum++;
      continue;
    }

    const vendorId = lines[0].vendor_id;

    // Create PO
    const { data: po, error: poError } = await (supabase as any)
      .from('purchase_orders')
      .insert({
        vendor_id: vendorId,
        venue_id: venueId,
        order_date: new Date().toISOString().split('T')[0],
        delivery_date: new Date(Date.now() + (Math.max(...lines.map(() => 7)) * 86400000))
          .toISOString().split('T')[0],
        status: settings.auto_po_requires_approval ? 'draft' : 'pending',
        total_amount: 0, // will be calculated by trigger
        generation_type: generationType,
        auto_generation_run_id: run?.id,
        requires_approval: settings.auto_po_requires_approval,
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (poError) continue;

    // Add line items
    await (supabase as any)
      .from('purchase_order_items')
      .insert(
        lines.map((line) => ({
          purchase_order_id: po.id,
          item_id: line.item_id,
          quantity: line.order_qty,
          unit_price: line.unit_price,
          notes: `Auto-generated (${line.need_source})`,
        }))
      );

    poIds.push(po.id);
  }

  // Update run with results
  const totalCost = Array.from(vendorGroups.values())
    .flat()
    .reduce((sum, l) => sum + l.order_qty * l.unit_price, 0);

  await (supabase as any)
    .from('po_generation_runs')
    .update({
      pos_generated: poIds.length,
      total_estimated_cost: totalCost,
    })
    .eq('id', run?.id);

  return {
    run_id: run?.id,
    pos_generated: poIds.length,
    items_evaluated: itemsEvaluated,
    items_needing_order: needMap.size,
    total_estimated_cost: totalCost,
    po_ids: poIds,
    skipped_below_minimum: skippedBelowMinimum,
  };
}

// ── Preview (dry run) ──────────────────────────────────────────────────

export async function previewAutoPurchaseOrders(
  venueId: string
): Promise<{ vendor_groups: Record<string, OrderLineItem[]>; total_cost: number }> {
  const supabase = getServiceClient();

  const { data: orderGuide } = await (supabase as any)
    .from('v_order_guide')
    .select('*')
    .eq('venue_id', venueId);

  const vendorGroups: Record<string, OrderLineItem[]> = {};
  let totalCost = 0;

  for (const item of orderGuide || []) {
    const vendorName = item.best_vendor_name || 'Unassigned';
    if (!vendorGroups[vendorName]) vendorGroups[vendorName] = [];

    const lineCost = (item.suggested_order_qty || 0) * (item.best_unit_price || 0);
    totalCost += lineCost;

    vendorGroups[vendorName].push({
      item_id: item.item_id,
      item_name: item.item_name,
      order_qty: item.suggested_order_qty || 0,
      unit_price: item.best_unit_price || 0,
      vendor_id: item.best_vendor_id || '',
      vendor_name: vendorName,
      need_source: item.need_sources?.includes('par') && item.need_sources?.includes('forecast')
        ? 'both' : (item.need_sources?.[0] || 'par'),
      moq: 1,
    });
  }

  return { vendor_groups: vendorGroups, total_cost: totalCost };
}

// ── Approval ───────────────────────────────────────────────────────────

export async function approvePurchaseOrder(
  poId: string,
  approvedBy: string
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any).rpc('approve_purchase_order', {
    p_po_id: poId,
    p_approved_by: approvedBy,
  });
  if (error) throw new Error(`Failed to approve PO: ${error.message}`);
}
