/**
 * GL Actuals — Real COGS from R365 general ledger
 * Replaces invoice-total proxy with actual GL account data.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────────────

export interface GLActual {
  id?: string;
  org_id: string;
  venue_id: string;
  gl_account_id: string;
  period_start: string;
  period_end: string;
  amount: number;
  source: 'r365' | 'manual' | 'import';
  source_ref?: string;
}

export interface GLCOGSMapping {
  id?: string;
  org_id: string;
  gl_account_id: string;
  cogs_category: 'food' | 'beverage' | 'liquor' | 'beer' | 'wine' | 'other';
  is_active: boolean;
}

export interface COGSVarianceRow {
  venue_id: string;
  sale_date: string;
  cogs_category: string;
  net_sales: number;
  theoretical_cost: number;
  actual_cost: number | null;
  variance_dollars: number;
  variance_pct: number | null;
  theoretical_food_cost_pct: number | null;
  actual_food_cost_pct: number | null;
}

// ── GL Actuals CRUD ────────────────────────────────────────────────────

export async function syncGLActuals(entries: GLActual[]): Promise<{ synced: number; errors: string[] }> {
  const supabase = getServiceClient();
  const errors: string[] = [];
  let synced = 0;

  // Batch upsert (Supabase handles conflict on unique constraint)
  const { error } = await (supabase as any)
    .from('gl_actuals')
    .upsert(entries, {
      onConflict: 'venue_id,gl_account_id,period_start,period_end,source_ref',
    });

  if (error) {
    errors.push(error.message);
  } else {
    synced = entries.length;
  }

  return { synced, errors };
}

export async function getGLActuals(
  venueId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('v_gl_cogs_summary')
    .select('*')
    .eq('venue_id', venueId)
    .gte('period_start', startDate)
    .lte('period_end', endDate)
    .order('period_start', { ascending: true });

  if (error) throw new Error(`Failed to fetch GL actuals: ${error.message}`);
  return data || [];
}

// ── COGS Mapping ───────────────────────────────────────────────────────

export async function getGLCOGSMappings(orgId: string): Promise<GLCOGSMapping[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('gl_cogs_mapping')
    .select('*, gl_accounts(name, external_code, section)')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (error) throw new Error(`Failed to fetch COGS mappings: ${error.message}`);
  return data || [];
}

export async function upsertGLCOGSMapping(mapping: GLCOGSMapping): Promise<GLCOGSMapping> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('gl_cogs_mapping')
    .upsert(mapping, { onConflict: 'org_id,gl_account_id' })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert COGS mapping: ${error.message}`);
  return data;
}

// ── Variance Reports ───────────────────────────────────────────────────

export async function getCOGSVariance(
  venueId: string,
  startDate: string,
  endDate: string,
  source: 'invoice' | 'gl' | 'both' = 'gl'
): Promise<COGSVarianceRow[]> {
  const supabase = getServiceClient();
  const viewName = source === 'invoice' ? 'v_food_cost_variance' : 'v_food_cost_variance_gl';

  const { data, error } = await (supabase as any)
    .from(viewName)
    .select('*')
    .eq('venue_id', venueId)
    .gte('sale_date', startDate)
    .lte('sale_date', endDate)
    .order('sale_date', { ascending: true });

  if (error) throw new Error(`Failed to fetch COGS variance: ${error.message}`);
  return data || [];
}

/**
 * Get COGS variance using the org's configured source preference.
 */
export async function getCOGSVarianceAuto(
  venueId: string,
  orgId: string,
  startDate: string,
  endDate: string
): Promise<COGSVarianceRow[]> {
  const supabase = getServiceClient();

  // Check org's cogs_source setting
  const { data: settings } = await (supabase as any)
    .from('procurement_settings')
    .select('cogs_source')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  const source = settings?.cogs_source || 'invoice';
  return getCOGSVariance(venueId, startDate, endDate, source);
}
