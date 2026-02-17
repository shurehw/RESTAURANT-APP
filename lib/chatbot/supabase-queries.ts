/**
 * Supabase-based queries for the OpsOS chatbot.
 * These query internal OpsOS tables (budgets, forecasts, invoices, inventory, exceptions)
 * that complement the TipSee POS queries in queries.ts.
 * Also includes real-time Pulse queries (live pace, period comparisons).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getLatestSnapshot,
  getForecastForDate,
  getSDLWFacts,
  getSalesPaceSettings,
  computePaceStatus,
  getBusinessDateForTimezone,
  getVenueTimezone,
  getVenueDayFactsForRange,
  getLaborDayFactsForRange,
  getVenueFiscalConfig,
} from '@/lib/database/sales-pace';
import { getFiscalPeriod, getSamePeriodLastYear } from '@/lib/fiscal-calendar';

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

// ---------------------------------------------------------------------------
// 6. Live Sales Pace (real-time)
// ---------------------------------------------------------------------------
export async function getLiveSalesPace(
  venueId: string
): Promise<Record<string, any>[]> {
  const tz = await getVenueTimezone(venueId);
  const businessDate = getBusinessDateForTimezone(tz);
  const [snapshot, settings, forecast, sdlw] = await Promise.all([
    getLatestSnapshot(venueId, businessDate),
    getSalesPaceSettings(venueId),
    getForecastForDate(venueId, businessDate),
    getSDLWFacts(venueId, businessDate),
  ]);

  if (!snapshot) {
    return [{ message: 'No sales data available yet for today. Service may not have started or polling is not active for this venue.' }];
  }

  const target = forecast?.revenue_predicted || sdlw?.net_sales || 0;
  const paceStatus = computePaceStatus(snapshot.net_sales, target, settings);

  const result: Record<string, any> = {
    business_date: businessDate,
    last_updated: snapshot.snapshot_at,
    net_sales: snapshot.net_sales,
    gross_sales: snapshot.gross_sales,
    food_sales: snapshot.food_sales,
    beverage_sales: snapshot.beverage_sales,
    beverage_pct: snapshot.bev_pct != null ? `${snapshot.bev_pct.toFixed(1)}%` : 'N/A',
    checks_count: snapshot.checks_count,
    covers_count: snapshot.covers_count,
    avg_check: snapshot.avg_check != null ? snapshot.avg_check.toFixed(2) : 'N/A',
    comps_total: snapshot.comps_total,
    voids_total: snapshot.voids_total,
    pace_status: paceStatus,
  };

  if (forecast) {
    result.forecast_revenue = forecast.revenue_predicted;
    result.forecast_covers = forecast.covers_predicted;
    result.pct_of_forecast = target > 0 ? `${((snapshot.net_sales / target) * 100).toFixed(1)}%` : 'N/A';
  }

  if (sdlw) {
    result.sdlw_net_sales = sdlw.net_sales;
    result.sdlw_covers = sdlw.covers_count;
    result.vs_sdlw_pct = sdlw.net_sales > 0
      ? `${(((snapshot.net_sales - sdlw.net_sales) / sdlw.net_sales) * 100).toFixed(1)}% (current vs SDLW final)`
      : 'N/A';
  }

  // Labor enrichment if available
  if (snapshot.labor_cost > 0) {
    result.labor_cost = snapshot.labor_cost;
    result.labor_hours = snapshot.labor_hours;
    result.labor_pct = snapshot.net_sales > 0
      ? `${((snapshot.labor_cost / snapshot.net_sales) * 100).toFixed(1)}%`
      : 'N/A';
  }

  // Comp exceptions if available
  if (snapshot.comp_exception_count > 0) {
    result.comp_exceptions = snapshot.comp_exception_count;
    result.comp_critical = snapshot.comp_critical_count;
  }

  return [result];
}

// ---------------------------------------------------------------------------
// 7. Period Comparison (WTD / PTD / YTD)
// ---------------------------------------------------------------------------

function getWeekStart(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayOfWeek = d.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysFromMonday);
  return d.toISOString().split('T')[0];
}

function shiftDate(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export async function getPeriodComparison(
  venueIds: string[],
  params: { view: 'wtd' | 'ptd' | 'ytd'; date?: string }
): Promise<Record<string, any>[]> {
  const anchorDate = params.date || new Date().toISOString().split('T')[0];
  const view = params.view;

  const fiscalConfig = await getVenueFiscalConfig(venueIds[0]);

  let currentStart: string;
  let currentEnd = anchorDate;
  let priorStart: string;
  let priorEnd: string;

  if (view === 'wtd') {
    currentStart = getWeekStart(anchorDate);
    priorStart = shiftDate(currentStart, -7);
    priorEnd = shiftDate(anchorDate, -7);
  } else if (view === 'ptd') {
    const fiscalPeriod = getFiscalPeriod(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);
    currentStart = fiscalPeriod.periodStartDate;
    const startParts = currentStart.split('-').map(Number);
    const anchorParts = anchorDate.split('-').map(Number);
    const daysIntoPeriod = Math.floor(
      (new Date(anchorParts[0], anchorParts[1] - 1, anchorParts[2]).getTime() -
        new Date(startParts[0], startParts[1] - 1, startParts[2]).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    const prevPeriodLastDay = shiftDate(currentStart, -1);
    const prevPeriodInfo = getFiscalPeriod(prevPeriodLastDay, fiscalConfig.calendarType, fiscalConfig.fyStartDate);
    priorStart = prevPeriodInfo.periodStartDate;
    priorEnd = shiftDate(priorStart, daysIntoPeriod);
  } else {
    // YTD
    if (fiscalConfig.calendarType === 'standard' || !fiscalConfig.fyStartDate) {
      const anchorParts = anchorDate.split('-').map(Number);
      currentStart = `${anchorParts[0]}-01-01`;
    } else {
      let fyStart = new Date(fiscalConfig.fyStartDate);
      const anchorParts = anchorDate.split('-').map(Number);
      const anchorDateObj = new Date(anchorParts[0], anchorParts[1] - 1, anchorParts[2]);
      while (anchorDateObj < fyStart) fyStart.setFullYear(fyStart.getFullYear() - 1);
      const nextYearStart = new Date(fyStart);
      nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
      while (anchorDateObj >= nextYearStart) {
        fyStart.setFullYear(fyStart.getFullYear() + 1);
        nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
      }
      currentStart = fyStart.toISOString().split('T')[0];
    }
    const prior = getSamePeriodLastYear(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);
    priorStart = prior.startDate;
    priorEnd = prior.endDate;
  }

  const [currentFacts, priorFacts, currentLabor, priorLabor] = await Promise.all([
    getVenueDayFactsForRange(venueIds, currentStart, currentEnd),
    getVenueDayFactsForRange(venueIds, priorStart, priorEnd),
    getLaborDayFactsForRange(venueIds, currentStart, currentEnd),
    getLaborDayFactsForRange(venueIds, priorStart, priorEnd),
  ]);

  const sum = (rows: typeof currentFacts) => rows.reduce(
    (a, r) => ({
      net_sales: a.net_sales + r.net_sales,
      gross_sales: a.gross_sales + r.gross_sales,
      food_sales: a.food_sales + r.food_sales,
      beverage_sales: a.beverage_sales + r.beverage_sales,
      comps_total: a.comps_total + r.comps_total,
      covers_count: a.covers_count + r.covers_count,
      checks_count: a.checks_count + r.checks_count,
      days: a.days + 1,
    }),
    { net_sales: 0, gross_sales: 0, food_sales: 0, beverage_sales: 0, comps_total: 0, covers_count: 0, checks_count: 0, days: 0 }
  );

  const cur = sum(currentFacts);
  const pri = sum(priorFacts);

  const curLaborCost = currentLabor.reduce((s, r) => s + r.labor_cost, 0);
  const curLaborHours = currentLabor.reduce((s, r) => s + r.total_hours, 0);
  const priLaborCost = priorLabor.reduce((s, r) => s + r.labor_cost, 0);

  const pct = (c: number, p: number) => p > 0 ? `${(((c - p) / p) * 100).toFixed(1)}%` : 'N/A';

  return [{
    view: view.toUpperCase(),
    period: `${currentStart} to ${currentEnd}`,
    prior_period: `${priorStart} to ${priorEnd}`,
    days_in_period: cur.days,
    current_net_sales: cur.net_sales,
    prior_net_sales: pri.net_sales,
    net_sales_change: pct(cur.net_sales, pri.net_sales),
    current_covers: cur.covers_count,
    prior_covers: pri.covers_count,
    covers_change: pct(cur.covers_count, pri.covers_count),
    current_avg_check: cur.checks_count > 0 ? (cur.gross_sales / cur.checks_count).toFixed(2) : 'N/A',
    prior_avg_check: pri.checks_count > 0 ? (pri.gross_sales / pri.checks_count).toFixed(2) : 'N/A',
    current_food_sales: cur.food_sales,
    current_beverage_sales: cur.beverage_sales,
    current_bev_pct: (cur.food_sales + cur.beverage_sales) > 0
      ? `${((cur.beverage_sales / (cur.food_sales + cur.beverage_sales)) * 100).toFixed(1)}%`
      : 'N/A',
    current_comps: cur.comps_total,
    current_comp_pct: cur.net_sales > 0 ? `${((cur.comps_total / cur.net_sales) * 100).toFixed(1)}%` : 'N/A',
    prior_comps: pri.comps_total,
    current_labor_cost: curLaborCost || 'N/A',
    current_labor_pct: cur.net_sales > 0 && curLaborCost > 0
      ? `${((curLaborCost / cur.net_sales) * 100).toFixed(1)}%`
      : 'N/A',
    current_splh: curLaborHours > 0 ? (cur.net_sales / curLaborHours).toFixed(2) : 'N/A',
    prior_labor_cost: priLaborCost || 'N/A',
  }];
}
