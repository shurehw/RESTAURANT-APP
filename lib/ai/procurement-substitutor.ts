/**
 * Procurement Substitutor
 *
 * When an item is unavailable (vendor out of stock, missed delivery,
 * price spike), finds and proposes substitutes based on configured
 * substitution rules. If auto_substitute is enabled for a rule,
 * the agent swaps without approval.
 *
 * Substitution types:
 *   equivalent     — same product, different vendor
 *   different_brand — same category, different brand
 *   different_size  — same product, different pack size
 *   upgrade        — higher quality/price substitute
 *   downgrade      — lower quality/price substitute
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface SubstitutionCandidate {
  rule_id: string;
  primary_item_id: string;
  primary_item_name: string;
  substitute_item_id: string;
  substitute_item_name: string;
  substitution_type: string;
  priority: number;
  price_impact_pct: number;
  auto_substitute: boolean;
  notes: string | null;
  substitute_available: boolean;
  substitute_on_hand: number | null;
  substitute_vendor_price: number | null;
}

export interface SubstitutionResult {
  primary_item_id: string;
  primary_item_name: string;
  action: 'auto_substituted' | 'proposed' | 'no_substitute';
  substitute_item_id?: string;
  substitute_item_name?: string;
  substitution_type?: string;
  price_impact_pct?: number;
  reason: string;
}

// ── Find Substitutes ──────────────────────────────────────────

/**
 * Find available substitutes for an item at a venue.
 * Returns candidates sorted by priority, with availability info.
 */
export async function findSubstitutes(
  orgId: string,
  itemId: string,
  venueId: string
): Promise<SubstitutionCandidate[]> {
  const supabase = getServiceClient();

  // Get substitution rules for this item
  const { data: rules } = await (supabase as any)
    .from('item_substitution_rules')
    .select(`
      id, primary_item_id, substitute_item_id,
      substitution_type, priority, price_impact_pct,
      auto_substitute, notes
    `)
    .eq('org_id', orgId)
    .eq('primary_item_id', itemId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (!rules || rules.length === 0) return [];

  // Look up item names + availability for each substitute
  const subItemIds = rules.map((r: any) => r.substitute_item_id);

  const [itemsResult, inventoryResult, vendorResult] = await Promise.all([
    // Item names
    (supabase as any)
      .from('items')
      .select('id, name')
      .in('id', [itemId, ...subItemIds]),

    // On-hand inventory at this venue
    (supabase as any)
      .from('inventory_balances')
      .select('item_id, quantity_on_hand')
      .eq('venue_id', venueId)
      .in('item_id', subItemIds),

    // Vendor pricing
    (supabase as any)
      .from('vendor_items')
      .select('item_id, tier_price')
      .in('item_id', subItemIds)
      .eq('is_active', true)
      .order('tier_price', { ascending: true }),
  ]);

  const nameMap = new Map<string, string>();
  for (const item of itemsResult.data || []) {
    nameMap.set(item.id, item.name);
  }

  const onHandMap = new Map<string, number>();
  for (const inv of inventoryResult.data || []) {
    onHandMap.set(inv.item_id, inv.quantity_on_hand || 0);
  }

  const priceMap = new Map<string, number>();
  for (const vi of vendorResult.data || []) {
    if (!priceMap.has(vi.item_id)) {
      priceMap.set(vi.item_id, vi.tier_price);
    }
  }

  return rules.map((rule: any) => {
    const onHand = onHandMap.get(rule.substitute_item_id);
    return {
      rule_id: rule.id,
      primary_item_id: rule.primary_item_id,
      primary_item_name: nameMap.get(rule.primary_item_id) || rule.primary_item_id,
      substitute_item_id: rule.substitute_item_id,
      substitute_item_name: nameMap.get(rule.substitute_item_id) || rule.substitute_item_id,
      substitution_type: rule.substitution_type,
      priority: rule.priority,
      price_impact_pct: rule.price_impact_pct,
      auto_substitute: rule.auto_substitute,
      notes: rule.notes,
      substitute_available: onHand !== undefined ? onHand > 0 : true, // assume available if no inventory tracking
      substitute_on_hand: onHand ?? null,
      substitute_vendor_price: priceMap.get(rule.substitute_item_id) ?? null,
    };
  });
}

/**
 * Attempt substitution for an unavailable item.
 * If a rule allows auto_substitute and the substitute is available,
 * performs the swap. Otherwise proposes alternatives.
 */
export async function attemptSubstitution(
  orgId: string,
  itemId: string,
  venueId: string,
  poId?: string
): Promise<SubstitutionResult> {
  const candidates = await findSubstitutes(orgId, itemId, venueId);

  if (candidates.length === 0) {
    return {
      primary_item_id: itemId,
      primary_item_name: itemId,
      action: 'no_substitute',
      reason: 'No substitution rules configured for this item.',
    };
  }

  // Find first available candidate
  const available = candidates.filter((c) => c.substitute_available);

  if (available.length === 0) {
    return {
      primary_item_id: candidates[0].primary_item_id,
      primary_item_name: candidates[0].primary_item_name,
      action: 'no_substitute',
      reason: `${candidates.length} substitution rules exist but none are currently in stock.`,
    };
  }

  const best = available[0]; // highest priority (lowest number) that's available

  // Auto-substitute if the rule allows it
  if (best.auto_substitute && poId) {
    await applySubstitution(poId, itemId, best.substitute_item_id);
    return {
      primary_item_id: best.primary_item_id,
      primary_item_name: best.primary_item_name,
      action: 'auto_substituted',
      substitute_item_id: best.substitute_item_id,
      substitute_item_name: best.substitute_item_name,
      substitution_type: best.substitution_type,
      price_impact_pct: best.price_impact_pct,
      reason: `Auto-substituted with ${best.substitute_item_name} (${best.substitution_type}, ${best.price_impact_pct >= 0 ? '+' : ''}${best.price_impact_pct}% price impact).`,
    };
  }

  // Otherwise, just propose
  return {
    primary_item_id: best.primary_item_id,
    primary_item_name: best.primary_item_name,
    action: 'proposed',
    substitute_item_id: best.substitute_item_id,
    substitute_item_name: best.substitute_item_name,
    substitution_type: best.substitution_type,
    price_impact_pct: best.price_impact_pct,
    reason: `Proposed substitute: ${best.substitute_item_name} (${best.substitution_type}). Requires manager approval.`,
  };
}

/**
 * Apply a substitution to a PO — swap item_id on the PO line.
 */
async function applySubstitution(
  poId: string,
  originalItemId: string,
  substituteItemId: string
): Promise<void> {
  const supabase = getServiceClient();

  // Get the PO line for the original item
  const { data: poLine } = await (supabase as any)
    .from('purchase_order_items')
    .select('id, quantity')
    .eq('purchase_order_id', poId)
    .eq('item_id', originalItemId)
    .maybeSingle();

  if (!poLine) return;

  // Get substitute item price
  const { data: vendorItem } = await (supabase as any)
    .from('vendor_items')
    .select('tier_price')
    .eq('item_id', substituteItemId)
    .eq('is_active', true)
    .order('tier_price', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Update PO line with substitute
  await (supabase as any)
    .from('purchase_order_items')
    .update({
      item_id: substituteItemId,
      unit_price: vendorItem?.tier_price || poLine.unit_price,
      notes: `Substituted for item ${originalItemId} (auto)`,
    })
    .eq('id', poLine.id);
}

/**
 * Get all substitution rules for an org, grouped by primary item.
 */
export async function getSubstitutionRules(
  orgId: string
): Promise<Map<string, SubstitutionCandidate[]>> {
  const supabase = getServiceClient();

  const { data: rules } = await (supabase as any)
    .from('item_substitution_rules')
    .select(`
      id, primary_item_id, substitute_item_id,
      substitution_type, priority, price_impact_pct,
      auto_substitute, notes
    `)
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('primary_item_id')
    .order('priority', { ascending: true });

  if (!rules) return new Map();

  // Get item names
  const itemIds = new Set<string>();
  for (const r of rules) {
    itemIds.add(r.primary_item_id);
    itemIds.add(r.substitute_item_id);
  }

  const { data: items } = await (supabase as any)
    .from('items')
    .select('id, name')
    .in('id', [...itemIds]);

  const nameMap = new Map<string, string>();
  for (const item of items || []) {
    nameMap.set(item.id, item.name);
  }

  const grouped = new Map<string, SubstitutionCandidate[]>();
  for (const rule of rules) {
    const key = rule.primary_item_id;
    const list = grouped.get(key) || [];
    list.push({
      rule_id: rule.id,
      primary_item_id: rule.primary_item_id,
      primary_item_name: nameMap.get(rule.primary_item_id) || rule.primary_item_id,
      substitute_item_id: rule.substitute_item_id,
      substitute_item_name: nameMap.get(rule.substitute_item_id) || rule.substitute_item_id,
      substitution_type: rule.substitution_type,
      priority: rule.priority,
      price_impact_pct: rule.price_impact_pct,
      auto_substitute: rule.auto_substitute,
      notes: rule.notes,
      substitute_available: true, // unknown without venue context
      substitute_on_hand: null,
      substitute_vendor_price: null,
    });
    grouped.set(key, list);
  }

  return grouped;
}

/**
 * Create or update a substitution rule.
 */
export async function upsertSubstitutionRule(
  orgId: string,
  rule: {
    primary_item_id: string;
    substitute_item_id: string;
    substitution_type: string;
    priority?: number;
    price_impact_pct?: number;
    auto_substitute?: boolean;
    notes?: string;
  },
  createdBy?: string
): Promise<{ success: boolean; rule_id?: string; error?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('item_substitution_rules')
    .upsert(
      {
        org_id: orgId,
        primary_item_id: rule.primary_item_id,
        substitute_item_id: rule.substitute_item_id,
        substitution_type: rule.substitution_type || 'equivalent',
        priority: rule.priority || 1,
        price_impact_pct: rule.price_impact_pct || 0,
        auto_substitute: rule.auto_substitute || false,
        notes: rule.notes || null,
        is_active: true,
        created_by: createdBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,primary_item_id,substitute_item_id' }
    )
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, rule_id: data.id };
}
