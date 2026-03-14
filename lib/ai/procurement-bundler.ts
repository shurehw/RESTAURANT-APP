/**
 * Cross-Venue Procurement Bundler
 *
 * Detects bundling opportunities across venues within the same org.
 * If Delilah LA, Miami, and Dallas all need cocktail napkins, the agent
 * consolidates into one PO at a volume break instead of three separate orders.
 *
 * The cross-venue bundling is the margin multiplier. The venue pays per-unit.
 * The entity captures the volume discount spread.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface BundleOpportunity {
  vendor_id: string;
  vendor_name: string;
  entity_code: string | null;
  venue_count: number;
  venue_ids: string[];
  venue_names: string[];
  items: Array<{
    item_id: string;
    item_name: string;
    total_qty: number;
    per_venue_qty: Record<string, number>; // venue_id → qty
    current_unit_price: number;
    bundled_unit_price: number;
    savings_per_unit: number;
  }>;
  total_amount_separate: number;
  total_amount_bundled: number;
  estimated_savings: number;
  savings_pct: number;
}

export interface BundleCreateResult {
  bundle_id: string;
  po_ids: string[];
  total_savings: number;
}

// ── Detection ──────────────────────────────────────────────────

/**
 * Detect bundling opportunities across venues for an org.
 * Looks at pending/draft POs within a time window and finds
 * items ordered by multiple venues from the same vendor.
 */
export async function detectBundlingOpportunities(
  orgId: string,
  windowHours: number = 24
): Promise<BundleOpportunity[]> {
  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - windowHours * 3600000).toISOString();

  // Get recent draft/pending POs for this org
  const { data: pos } = await (supabase as any)
    .from('purchase_orders')
    .select(`
      id, vendor_id, venue_id, entity_code, total_amount, status,
      vendors(name),
      venues(name),
      purchase_order_items(item_id, quantity, unit_price, items(name))
    `)
    .in('status', ['draft', 'pending'])
    .gte('created_at', cutoff)
    .in('venue_id', await getOrgVenueIds(orgId));

  if (!pos || pos.length < 2) return [];

  // Group by vendor_id
  const vendorGroups = new Map<string, any[]>();
  for (const po of pos) {
    const group = vendorGroups.get(po.vendor_id) || [];
    group.push(po);
    vendorGroups.set(po.vendor_id, group);
  }

  const opportunities: BundleOpportunity[] = [];

  for (const [vendorId, vendorPOs] of vendorGroups) {
    // Need POs from at least 2 different venues
    const venueIds = [...new Set(vendorPOs.map((po: any) => po.venue_id))];
    if (venueIds.length < 2) continue;

    // Find items ordered by multiple venues
    const itemAgg = new Map<string, {
      item_name: string;
      per_venue_qty: Record<string, number>;
      current_price: number;
    }>();

    for (const po of vendorPOs) {
      for (const item of po.purchase_order_items || []) {
        const existing = itemAgg.get(item.item_id) || {
          item_name: item.items?.name || item.item_id,
          per_venue_qty: {} as Record<string, number>,
          current_price: item.unit_price,
        };
        const venueId: string = po.venue_id;
        existing.per_venue_qty[venueId] =
          (existing.per_venue_qty[venueId] || 0) + item.quantity;
        itemAgg.set(item.item_id, existing);
      }
    }

    // Filter to items ordered by 2+ venues
    const bundleItems: BundleOpportunity['items'] = [];
    let totalSeparate = 0;
    let totalBundled = 0;

    for (const [itemId, agg] of itemAgg) {
      const venuesOrdering = Object.keys(agg.per_venue_qty).length;
      if (venuesOrdering < 2) continue;

      const totalQty = Object.values(agg.per_venue_qty).reduce((a, b) => a + b, 0);

      // Check if combined qty hits a better price tier
      const { data: tiers } = await (supabase as any)
        .from('vendor_items')
        .select('tier_qty, tier_price, moq')
        .eq('item_id', itemId)
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .order('tier_price', { ascending: true });

      let bundledPrice = agg.current_price;
      if (tiers?.length) {
        // Find best tier for combined quantity
        const bestTier = tiers.find((t: any) => totalQty >= t.tier_qty) || tiers[0];
        bundledPrice = bestTier.tier_price;
      }

      const separateCost = totalQty * agg.current_price;
      const bundledCost = totalQty * bundledPrice;

      totalSeparate += separateCost;
      totalBundled += bundledCost;

      bundleItems.push({
        item_id: itemId,
        item_name: agg.item_name,
        total_qty: totalQty,
        per_venue_qty: agg.per_venue_qty,
        current_unit_price: agg.current_price,
        bundled_unit_price: bundledPrice,
        savings_per_unit: agg.current_price - bundledPrice,
      });
    }

    if (bundleItems.length === 0) continue;

    const savings = totalSeparate - totalBundled;
    const savingsPct = totalSeparate > 0 ? Math.round((savings / totalSeparate) * 10000) / 100 : 0;

    // Only surface if savings exceed minimum threshold
    if (savingsPct < 1) continue;

    const venueNames = vendorPOs
      .map((po: any) => po.venues?.name)
      .filter((n: any, i: number, arr: any[]) => arr.indexOf(n) === i);

    opportunities.push({
      vendor_id: vendorId,
      vendor_name: vendorPOs[0].vendors?.name || vendorId,
      entity_code: vendorPOs[0].entity_code || null,
      venue_count: venueIds.length,
      venue_ids: venueIds,
      venue_names: venueNames,
      items: bundleItems,
      total_amount_separate: Math.round(totalSeparate * 100) / 100,
      total_amount_bundled: Math.round(totalBundled * 100) / 100,
      estimated_savings: Math.round(savings * 100) / 100,
      savings_pct: savingsPct,
    });
  }

  return opportunities.sort((a, b) => b.estimated_savings - a.estimated_savings);
}

/**
 * Execute a bundle: create a bundle group and mark individual POs as bundled.
 */
export async function executeBundle(
  orgId: string,
  opportunity: BundleOpportunity,
  approvedBy: string
): Promise<BundleCreateResult> {
  const supabase = getServiceClient();

  // Create bundle group
  const { data: bundle, error: bundleError } = await (supabase as any)
    .from('po_bundle_groups')
    .insert({
      org_id: orgId,
      entity_code: opportunity.entity_code,
      vendor_id: opportunity.vendor_id,
      venue_ids: opportunity.venue_ids,
      total_amount: opportunity.total_amount_bundled,
      volume_discount_pct: opportunity.savings_pct,
      estimated_savings: opportunity.estimated_savings,
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (bundleError) throw new Error(`Failed to create bundle: ${bundleError.message}`);

  // Update individual POs with bundle_group_id
  const { data: relatedPOs } = await (supabase as any)
    .from('purchase_orders')
    .select('id')
    .eq('vendor_id', opportunity.vendor_id)
    .in('venue_id', opportunity.venue_ids)
    .in('status', ['draft', 'pending']);

  const poIds = (relatedPOs || []).map((po: any) => po.id);

  if (poIds.length > 0) {
    await (supabase as any)
      .from('purchase_orders')
      .update({
        is_bundled: true,
        bundle_group_id: bundle.id,
      })
      .in('id', poIds);
  }

  return {
    bundle_id: bundle.id,
    po_ids: poIds,
    total_savings: opportunity.estimated_savings,
  };
}

// ── Helpers ──────────────────────────────────────────────────

async function getOrgVenueIds(orgId: string): Promise<string[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('venues')
    .select('id')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  return (data || []).map((v: any) => v.id);
}
