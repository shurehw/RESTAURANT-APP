/**
 * Inter-Venue Inventory Rebalancer
 *
 * Detects when one venue has surplus inventory (well above par)
 * while another venue in the same org has a deficit (approaching
 * or below reorder point). Proposes transfers instead of new POs.
 *
 * Transfer from a venue at 200% par is cheaper than a new order.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface RebalancingOpportunity {
  item_id: string;
  item_name: string;
  from_venue_id: string;
  from_venue_name: string;
  from_on_hand: number;
  from_par: number;
  from_surplus: number; // on_hand - par
  to_venue_id: string;
  to_venue_name: string;
  to_on_hand: number;
  to_par: number;
  to_deficit: number; // par - on_hand (positive = needs stock)
  suggested_transfer_qty: number;
  estimated_unit_cost: number;
  estimated_total_cost: number;
  new_order_cost: number; // what it would cost to order from vendor instead
  savings: number; // new_order_cost - transfer_cost
  reason: string;
}

// ── Detection ──────────────────────────────────────────────────

/**
 * Detect rebalancing opportunities across all venues in an org.
 * Compares par levels vs on-hand inventory at each venue.
 */
export async function detectRebalancingOpportunities(
  orgId: string
): Promise<RebalancingOpportunity[]> {
  const supabase = getServiceClient();

  // Get all venue par levels with on-hand quantities
  const { data: pars } = await (supabase as any)
    .from('item_pars')
    .select(`
      item_id, venue_id, par_level, reorder_point, quantity_on_hand,
      items(name),
      venues!inner(name, organization_id)
    `)
    .eq('venues.organization_id', orgId);

  if (!pars || pars.length === 0) return [];

  // Group by item_id
  const itemVenues = new Map<string, Array<{
    venue_id: string;
    venue_name: string;
    item_name: string;
    par_level: number;
    reorder_point: number;
    on_hand: number;
  }>>();

  for (const par of pars) {
    const itemId = par.item_id;
    const venues = itemVenues.get(itemId) || [];
    venues.push({
      venue_id: par.venue_id,
      venue_name: par.venues?.name || par.venue_id,
      item_name: par.items?.name || itemId,
      par_level: par.par_level || 0,
      reorder_point: par.reorder_point || 0,
      on_hand: par.quantity_on_hand || 0,
    });
    itemVenues.set(itemId, venues);
  }

  const opportunities: RebalancingOpportunity[] = [];

  for (const [itemId, venues] of itemVenues) {
    // Need at least 2 venues tracking this item
    if (venues.length < 2) continue;

    // Find surplus venues (>150% of par) and deficit venues (below reorder point)
    const surplus = venues.filter((v) => v.par_level > 0 && v.on_hand > v.par_level * 1.5);
    const deficit = venues.filter((v) => v.reorder_point > 0 && v.on_hand < v.reorder_point);

    if (surplus.length === 0 || deficit.length === 0) continue;

    // Match surplus to deficit
    for (const fromVenue of surplus) {
      for (const toVenue of deficit) {
        const surplusQty = fromVenue.on_hand - fromVenue.par_level;
        const deficitQty = toVenue.par_level - toVenue.on_hand;
        const transferQty = Math.min(surplusQty, deficitQty);

        if (transferQty <= 0) continue;

        // Estimate costs
        const { data: vendorItem } = await (supabase as any)
          .from('vendor_items')
          .select('tier_price')
          .eq('item_id', itemId)
          .eq('is_active', true)
          .order('tier_price', { ascending: true })
          .limit(1)
          .maybeSingle();

        const unitCost = vendorItem?.tier_price || 0;
        // Transfer cost is roughly 0 (internal) vs vendor order cost
        const transferCost = 0; // internal transfer, no product cost
        const newOrderCost = transferQty * unitCost;
        const savings = newOrderCost - transferCost;

        if (savings <= 0) continue;

        opportunities.push({
          item_id: itemId,
          item_name: fromVenue.item_name,
          from_venue_id: fromVenue.venue_id,
          from_venue_name: fromVenue.venue_name,
          from_on_hand: fromVenue.on_hand,
          from_par: fromVenue.par_level,
          from_surplus: surplusQty,
          to_venue_id: toVenue.venue_id,
          to_venue_name: toVenue.venue_name,
          to_on_hand: toVenue.on_hand,
          to_par: toVenue.par_level,
          to_deficit: deficitQty,
          suggested_transfer_qty: transferQty,
          estimated_unit_cost: unitCost,
          estimated_total_cost: transferCost,
          new_order_cost: newOrderCost,
          savings,
          reason: `${fromVenue.venue_name} has ${Math.round(fromVenue.on_hand / fromVenue.par_level * 100)}% of par, ${toVenue.venue_name} is at ${Math.round(toVenue.on_hand / toVenue.par_level * 100)}%. Transfer saves $${savings.toFixed(2)} vs new order.`,
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.savings - a.savings);
}

/**
 * Create a transfer proposal from a rebalancing opportunity.
 */
export async function createTransferProposal(
  orgId: string,
  opportunity: RebalancingOpportunity
): Promise<{ success: boolean; transfer_id?: string; error?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('inventory_transfers')
    .insert({
      org_id: orgId,
      from_venue_id: opportunity.from_venue_id,
      to_venue_id: opportunity.to_venue_id,
      item_id: opportunity.item_id,
      quantity: opportunity.suggested_transfer_qty,
      unit_cost: opportunity.estimated_unit_cost,
      status: 'proposed',
      proposed_by: 'agent',
      proposed_reason: opportunity.reason,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, transfer_id: data.id };
}

/**
 * Approve a transfer proposal.
 */
export async function approveTransfer(
  transferId: string,
  approvedBy: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('inventory_transfers')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', transferId)
    .eq('status', 'proposed');

  if (error) return { success: false, error: error.message };
  return { success: true };
}
