/**
 * Supabase-based queries for the OpsOS chatbot.
 * These query internal OpsOS tables (budgets, forecasts, invoices, inventory, exceptions)
 * that complement the TipSee POS queries in queries.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ROWS = 50;

// ---------------------------------------------------------------------------
// 1. Budget vs Actual (daily_variance view)
// ---------------------------------------------------------------------------
export async function getBudgetVariance(
  supabase: SupabaseClient,
  venueIds: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const { data, error } = await supabase
    .from('daily_variance')
    .select('*')
    .in('venue_id', venueIds)
    .gte('business_date', params.startDate)
    .lte('business_date', params.endDate)
    .order('business_date', { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// 2. Operational Exceptions (operational_exceptions view)
// ---------------------------------------------------------------------------
export async function getOperationalExceptions(
  supabase: SupabaseClient,
  venueIds: string[]
): Promise<Record<string, any>[]> {
  const { data, error } = await supabase
    .from('operational_exceptions')
    .select('exception_type, venue_name, business_date, severity, title, description')
    .in('venue_id', venueIds)
    .order('severity', { ascending: true })
    .limit(MAX_ROWS);

  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// 3. Demand Forecasts
// ---------------------------------------------------------------------------
export async function getDemandForecasts(
  supabase: SupabaseClient,
  venueIds: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const { data, error } = await supabase
    .from('demand_forecasts')
    .select('business_date, shift_type, covers_predicted, covers_lower, covers_upper, confidence_level, revenue_predicted')
    .in('venue_id', venueIds)
    .gte('business_date', params.startDate)
    .lte('business_date', params.endDate)
    .order('business_date')
    .limit(MAX_ROWS);

  if (error) throw error;
  return data || [];
}

// ---------------------------------------------------------------------------
// 4. Invoices
// ---------------------------------------------------------------------------
export async function getInvoices(
  supabase: SupabaseClient,
  venueIds: string[],
  params: { startDate: string; endDate: string; status?: string }
): Promise<Record<string, any>[]> {
  let query = supabase
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, total_amount, status,
      vendor:vendors(name)
    `)
    .in('venue_id', venueIds)
    .gte('invoice_date', params.startDate)
    .lte('invoice_date', params.endDate)
    .order('invoice_date', { ascending: false })
    .limit(MAX_ROWS);

  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((inv: any) => ({
    ...inv,
    vendor_name: inv.vendor?.name || 'Unknown',
    vendor: undefined,
  }));
}

// ---------------------------------------------------------------------------
// 5. Current Inventory
// ---------------------------------------------------------------------------
export async function getCurrentInventory(
  supabase: SupabaseClient,
  venueIds: string[],
  params: { category?: string; search?: string }
): Promise<Record<string, any>[]> {
  let query = supabase
    .from('v_current_inventory')
    .select('venue_name, item_name, category, quantity_on_hand, unit_of_measure, last_cost, total_value')
    .in('venue_id', venueIds)
    .order('total_value', { ascending: false })
    .limit(MAX_ROWS);

  if (params.category) {
    query = query.ilike('category', `%${params.category}%`);
  }
  if (params.search) {
    query = query.ilike('item_name', `%${params.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
