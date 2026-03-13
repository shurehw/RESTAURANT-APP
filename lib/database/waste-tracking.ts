/**
 * Waste Tracking — Structured waste logging with reason codes
 * Routes alerts to Action Center when thresholds are breached.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────────────

export interface WasteReasonCode {
  id: string;
  org_id: string;
  code: string;
  label: string;
  description: string | null;
  requires_notes: boolean;
  is_active: boolean;
  display_order: number;
}

export interface WasteLogEntry {
  venue_id: string;
  item_id: string;
  reason_code_id: string;
  quantity: number;
  uom?: string;
  unit_cost?: number;
  notes?: string;
  recorded_by?: string;
  business_date: string;
  shift_period?: 'prep' | 'lunch' | 'dinner' | 'late_night' | 'close';
}

export interface WasteSummary {
  venue_id: string;
  business_date: string;
  reason_code: string;
  reason_label: string;
  log_count: number;
  total_quantity: number;
  total_cost: number;
  distinct_items: number;
}

export interface WasteTrend {
  venue_id: string;
  reason_code: string;
  reason_label: string;
  week_start: string;
  log_count: number;
  total_cost: number;
  avg_cost_per_event: number;
}

// ── Reason Codes ───────────────────────────────────────────────────────

export async function getWasteReasonCodes(orgId: string): Promise<WasteReasonCode[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('waste_reason_codes')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('display_order');

  if (error) throw new Error(`Failed to fetch waste reason codes: ${error.message}`);
  return data || [];
}

export async function upsertWasteReasonCode(
  orgId: string,
  code: string,
  updates: Partial<WasteReasonCode>
): Promise<WasteReasonCode> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('waste_reason_codes')
    .upsert({ org_id: orgId, code, ...updates }, { onConflict: 'org_id,code' })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert waste reason code: ${error.message}`);
  return data;
}

// ── Waste Logging ──────────────────────────────────────────────────────

export async function logWaste(entry: WasteLogEntry): Promise<{ id: string; total_cost: number }> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('waste_logs')
    .insert(entry)
    .select('id, total_cost')
    .single();

  if (error) throw new Error(`Failed to log waste: ${error.message}`);
  return data;
}

export async function logWasteBatch(entries: WasteLogEntry[]): Promise<{ logged: number; errors: string[] }> {
  const errors: string[] = [];
  let logged = 0;

  for (const entry of entries) {
    try {
      await logWaste(entry);
      logged++;
    } catch (err: any) {
      errors.push(`Item ${entry.item_id}: ${err.message}`);
    }
  }

  return { logged, errors };
}

// ── Queries ────────────────────────────────────────────────────────────

export async function getWasteSummary(
  venueId: string,
  startDate: string,
  endDate: string
): Promise<WasteSummary[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('v_waste_summary')
    .select('*')
    .eq('venue_id', venueId)
    .gte('business_date', startDate)
    .lte('business_date', endDate);

  if (error) throw new Error(`Failed to fetch waste summary: ${error.message}`);
  return data || [];
}

export async function getWasteByItem(
  venueId: string,
  startDate: string,
  endDate: string,
  limit = 20
): Promise<any[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('v_waste_by_item')
    .select('*')
    .eq('venue_id', venueId)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('total_cost', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch waste by item: ${error.message}`);
  return data || [];
}

export async function getWasteTrend(
  venueId: string,
  weeks = 12
): Promise<WasteTrend[]> {
  const supabase = getServiceClient();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeks * 7);

  const { data, error } = await (supabase as any)
    .from('v_waste_trend')
    .select('*')
    .eq('venue_id', venueId)
    .gte('week_start', startDate.toISOString().split('T')[0])
    .order('week_start', { ascending: true });

  if (error) throw new Error(`Failed to fetch waste trend: ${error.message}`);
  return data || [];
}

// ── Daily Waste Check (for cron / enforcement) ─────────────────────────

export async function getDailyWasteTotal(
  venueId: string,
  businessDate: string
): Promise<{ total_cost: number; log_count: number; theft_count: number }> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('waste_logs')
    .select('total_cost, reason_code_id, waste_reason_codes!inner(code)')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate);

  if (error) throw new Error(`Failed to fetch daily waste: ${error.message}`);

  const logs = data || [];
  return {
    total_cost: logs.reduce((sum: number, l: any) => sum + (l.total_cost || 0), 0),
    log_count: logs.length,
    theft_count: logs.filter((l: any) => l.waste_reason_codes?.code === 'theft').length,
  };
}
