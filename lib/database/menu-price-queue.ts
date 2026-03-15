/**
 * Menu Price Queue
 *
 * Manages batched price changes that respect physical menu constraints.
 * MP/digital items execute immediately; printed items queue for reprint windows.
 * Tracks margin bleed while waiting.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface PriceQueueEntry {
  venue_id: string;
  org_id: string;
  recipe_id: string;
  menu_item_name: string;
  current_price: number;
  recommended_price: number;
  price_change_pct: number;
  reason: string;
  action_type: 'price_increase' | 'price_decrease' | 'market_price_update';
  margin_bleed_per_week?: number;
  comp_set_context?: Record<string, unknown>;
  surface?: string;
  target_reprint_date?: string;
  run_id?: string;
  recommendation_id?: string;
}

export interface MarginBleedSummary {
  venue_id: string;
  total_queued: number;
  total_margin_bleed_per_week: number;
  next_reprint_date: string | null;
  items: Array<{
    recipe_id: string;
    menu_item_name: string;
    current_price: number;
    recommended_price: number;
    margin_bleed_per_week: number;
    days_waiting: number;
  }>;
}

// ── Queue Operations ──────────────────────────────────────────

export async function queuePriceChange(
  entry: PriceQueueEntry
): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('menu_agent_price_queue')
    .insert({
      venue_id: entry.venue_id,
      org_id: entry.org_id,
      recipe_id: entry.recipe_id,
      menu_item_name: entry.menu_item_name,
      current_price: entry.current_price,
      recommended_price: entry.recommended_price,
      price_change_pct: entry.price_change_pct,
      reason: entry.reason,
      action_type: entry.action_type,
      margin_bleed_per_week: entry.margin_bleed_per_week ?? null,
      comp_set_context: entry.comp_set_context ?? {},
      surface: entry.surface ?? null,
      target_reprint_date: entry.target_reprint_date ?? null,
      run_id: entry.run_id ?? null,
      recommendation_id: entry.recommendation_id ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to queue price change: ${error.message}`);
  return data.id;
}

export async function queuePriceChanges(
  entries: PriceQueueEntry[]
): Promise<string[]> {
  if (entries.length === 0) return [];
  const ids: string[] = [];
  for (const entry of entries) {
    const id = await queuePriceChange(entry);
    ids.push(id);
  }
  return ids;
}

// ── Query ──────────────────────────────────────────────────────

export async function getQueuedChangesForReprint(
  venueId: string,
  reprintDate?: string
): Promise<any[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('menu_agent_price_queue')
    .select('*')
    .eq('venue_id', venueId)
    .eq('status', 'queued');

  if (reprintDate) {
    query = query.lte('target_reprint_date', reprintDate);
  }

  const { data } = await query.order('created_at', { ascending: true });
  return data || [];
}

export async function getMarketPriceQueue(venueId: string): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('menu_agent_price_queue')
    .select('*')
    .eq('venue_id', venueId)
    .eq('status', 'queued')
    .eq('action_type', 'market_price_update')
    .order('created_at', { ascending: true });

  return data || [];
}

export async function getAllQueuedChanges(venueId: string): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('menu_agent_price_queue')
    .select('*')
    .eq('venue_id', venueId)
    .in('status', ['queued', 'approved'])
    .order('target_reprint_date', { ascending: true, nullsFirst: false });

  return data || [];
}

// ── Lifecycle ──────────────────────────────────────────────────

export async function approveQueuedChange(
  queueId: string,
  userId: string
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('menu_agent_price_queue')
    .update({
      status: 'approved',
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', queueId)
    .eq('status', 'queued');

  if (error) {
    console.error('[MenuPriceQueue] Error approving:', error.message);
  }
}

export async function applyQueuedChange(queueId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('menu_agent_price_queue')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
    })
    .eq('id', queueId)
    .in('status', ['queued', 'approved']);

  if (error) {
    console.error('[MenuPriceQueue] Error applying:', error.message);
  }
}

export async function rejectQueuedChange(
  queueId: string,
  userId: string,
  reason: string
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('menu_agent_price_queue')
    .update({
      status: 'rejected',
      rejected_reason: reason,
      approved_by: userId, // track who rejected
      approved_at: new Date().toISOString(),
    })
    .eq('id', queueId)
    .eq('status', 'queued');

  if (error) {
    console.error('[MenuPriceQueue] Error rejecting:', error.message);
  }
}

export async function expireStaleQueueEntries(
  daysOld: number = 90
): Promise<number> {
  const supabase = getServiceClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const { data, error } = await (supabase as any)
    .from('menu_agent_price_queue')
    .update({ status: 'expired' })
    .eq('status', 'queued')
    .lt('created_at', cutoff.toISOString())
    .select('id');

  if (error) {
    console.error('[MenuPriceQueue] Error expiring stale entries:', error.message);
    return 0;
  }

  return data?.length || 0;
}

// ── Margin Bleed Summary ──────────────────────────────────────

export async function getMarginBleedSummary(
  venueId: string
): Promise<MarginBleedSummary> {
  const queued = await getAllQueuedChanges(venueId);

  const now = new Date();
  const items = queued.map((q: any) => ({
    recipe_id: q.recipe_id,
    menu_item_name: q.menu_item_name,
    current_price: q.current_price,
    recommended_price: q.recommended_price,
    margin_bleed_per_week: q.margin_bleed_per_week || 0,
    days_waiting: Math.floor(
      (now.getTime() - new Date(q.created_at).getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));

  const totalBleed = items.reduce(
    (sum: number, i: any) => sum + (i.margin_bleed_per_week || 0),
    0
  );

  // Find next reprint date across all queued items
  const reprintDates = queued
    .map((q: any) => q.target_reprint_date)
    .filter(Boolean)
    .sort();

  return {
    venue_id: venueId,
    total_queued: items.length,
    total_margin_bleed_per_week: totalBleed,
    next_reprint_date: reprintDates[0] || null,
    items,
  };
}
