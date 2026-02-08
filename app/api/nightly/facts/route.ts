/**
 * Nightly Facts API
 * Fetches pre-aggregated data from fact tables (faster than live TipSee queries)
 *
 * GET /api/nightly/facts?date=2024-01-15&venue_id=xxx
 * GET /api/nightly/facts?action=mappings - Get venue-TipSee mappings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getFiscalPeriod, FiscalCalendarType } from '@/lib/fiscal-calendar';
import { fetchLaborSummary } from '@/lib/database/tipsee'; // Fallback for live query

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const date = searchParams.get('date');
  const venueId = searchParams.get('venue_id');

  const supabase = getServiceClient();

  try {
    // Return venue mappings
    if (action === 'mappings') {
      const { data, error } = await (supabase as any)
        .from('venue_tipsee_mapping')
        .select(`
          venue_id,
          tipsee_location_uuid,
          tipsee_location_name,
          venues!inner(id, name)
        `)
        .eq('is_active', true);

      if (error) throw error;

      const mappings = (data || []).map((row: any) => ({
        venue_id: row.venue_id,
        venue_name: row.venues?.name,
        tipsee_location_uuid: row.tipsee_location_uuid,
        tipsee_location_name: row.tipsee_location_name,
      }));

      return NextResponse.json({ mappings });
    }

    // Require date and venue_id for fact queries
    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'date and venue_id are required' },
        { status: 400 }
      );
    }

    // Calculate comparison dates
    const currentDate = new Date(date);
    const sdlwDate = new Date(currentDate);
    sdlwDate.setDate(sdlwDate.getDate() - 7);
    const sdlwDateStr = sdlwDate.toISOString().split('T')[0];

    const sdlyDate = new Date(currentDate);
    sdlyDate.setFullYear(sdlyDate.getFullYear() - 1);
    const sdlyDateStr = sdlyDate.toISOString().split('T')[0];

    // Fetch venue org, fiscal settings, and TipSee mapping in parallel
    const [venueOrgResult, mappingResult] = await Promise.all([
      (supabase as any)
        .from('venues')
        .select('organization_id')
        .eq('id', venueId)
        .single(),
      (supabase as any)
        .from('venue_tipsee_mapping')
        .select('tipsee_location_uuid')
        .eq('venue_id', venueId)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    const venueData = venueOrgResult.data;
    const tipseeLocationUuid = mappingResult.data?.tipsee_location_uuid || null;

    let fiscalCalendarType: FiscalCalendarType = 'standard';
    let fiscalYearStartDate: string | null = null;

    const VALID_CALENDAR_TYPES: FiscalCalendarType[] = ['standard', '4-4-5', '4-5-4', '5-4-4'];

    if (venueData?.organization_id) {
      const { data: settingsData } = await (supabase as any)
        .from('proforma_settings')
        .select('fiscal_calendar_type, fiscal_year_start_date')
        .eq('org_id', venueData.organization_id)
        .single();

      if (settingsData) {
        const dbCalendarType = settingsData.fiscal_calendar_type;
        if (dbCalendarType && VALID_CALENDAR_TYPES.includes(dbCalendarType)) {
          fiscalCalendarType = dbCalendarType;
        } else if (dbCalendarType) {
          console.warn(`Invalid fiscal_calendar_type '${dbCalendarType}' for org ${venueData.organization_id}, using 'standard'`);
        }
        fiscalYearStartDate = settingsData.fiscal_year_start_date;
      }
    }

    // Get fiscal period info for PTD calculation
    const fiscalPeriod = getFiscalPeriod(date, fiscalCalendarType, fiscalYearStartDate);

    // PTD (Period-to-Date): Start of fiscal period → selected date
    const periodStartStr = fiscalPeriod.periodStartDate;

    // For PTD comparison: same relative days into PREVIOUS period
    // Go back to before current period starts to land in previous period
    const currentPeriodStart = new Date(fiscalPeriod.periodStartDate);
    const prevPeriodDate = new Date(currentPeriodStart);
    prevPeriodDate.setDate(prevPeriodDate.getDate() - 1); // Go to last day of previous period
    const prevPeriodInfo = getFiscalPeriod(prevPeriodDate.toISOString().split('T')[0], fiscalCalendarType, fiscalYearStartDate);
    const prevPeriodStartStr = prevPeriodInfo.periodStartDate;

    // Calculate days into current period (using local dates)
    const periodStartParts = periodStartStr.split('-').map(Number);
    const dateParts = date.split('-').map(Number);
    const periodStartDate = new Date(periodStartParts[0], periodStartParts[1] - 1, periodStartParts[2]);
    const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const daysIntoPeriod = Math.floor((targetDate.getTime() - periodStartDate.getTime()) / (24 * 60 * 60 * 1000));

    // Calculate equivalent end date in previous period
    const prevStartParts = prevPeriodStartStr.split('-').map(Number);
    const prevPeriodStartDate = new Date(prevStartParts[0], prevStartParts[1] - 1, prevStartParts[2]);
    const prevPeriodEndDate = new Date(prevPeriodStartDate);
    prevPeriodEndDate.setDate(prevPeriodEndDate.getDate() + daysIntoPeriod);
    const prevPeriodEndStr = prevPeriodEndDate.toISOString().split('T')[0];

    // WTD (Week-to-Date): Monday → selected date (calendar week, not fiscal)
    const dayOfWeek = targetDate.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStartDate = new Date(targetDate);
    weekStartDate.setDate(weekStartDate.getDate() - daysFromMonday);
    const weekStartStr = weekStartDate.toISOString().split('T')[0];

    // WTD Last Week: Same Mon→Day range but 7 days earlier
    const lastWeekWeekStart = new Date(weekStartDate);
    lastWeekWeekStart.setDate(lastWeekWeekStart.getDate() - 7);
    const lastWeekWeekStartStr = lastWeekWeekStart.toISOString().split('T')[0];
    const lastWeekSameDayStr = sdlwDateStr;

    // Fetch all fact data in parallel
    const [
      venueDayResult,
      categoryResult,
      serverResult,
      itemResult,
      laborFactResult,
      forecastResult,
      sdlwResult,
      sdlyResult,
      ptdThisWeekResult,
      ptdLastWeekResult,
      wtdThisWeekResult,
      wtdLastWeekResult,
      serverWtdResult,
      serverPtdResult,
    ] = await Promise.all([
      // Venue day facts (summary)
      (supabase as any)
        .from('venue_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .single(),

      // Category breakdown
      (supabase as any)
        .from('category_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false }),

      // Server performance
      (supabase as any)
        .from('server_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false }),

      // Menu items
      (supabase as any)
        .from('item_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false })
        .limit(15),

      // Labor day facts
      (supabase as any)
        .from('labor_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .maybeSingle(),

      // Demand forecasts with bias correction (covers and revenue)
      (supabase as any)
        .from('forecasts_with_bias')
        .select('covers_predicted, covers_lower, covers_upper, revenue_predicted, covers_raw, bias_corrected')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .maybeSingle(),

      // Same Day Last Week (SDLW) - 7 days ago
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count, beverage_pct')
        .eq('venue_id', venueId)
        .eq('business_date', sdlwDateStr)
        .maybeSingle(),

      // Same Day Last Year (SDLY) - 1 year ago
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count, beverage_pct')
        .eq('venue_id', venueId)
        .eq('business_date', sdlyDateStr)
        .maybeSingle(),

      // PTD This Period (fiscal period start → selected date)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),

      // PTD Last Period (same # of days into previous period)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', prevPeriodStartStr)
        .lte('business_date', prevPeriodEndStr),

      // WTD This Week (Monday → selected date, calendar week)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),

      // WTD Last Week (same Mon→Day range, 7 days earlier)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', lastWeekWeekStartStr)
        .lte('business_date', lastWeekSameDayStr),

      // Server WTD (aggregated server performance for the week)
      (supabase as any)
        .from('server_day_facts')
        .select('employee_name, employee_role, gross_sales, checks_count, covers_count, tips_total, avg_turn_mins, business_date')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),

      // Server PTD (aggregated server performance for the fiscal period)
      (supabase as any)
        .from('server_day_facts')
        .select('employee_name, employee_role, gross_sales, checks_count, covers_count, tips_total, avg_turn_mins, business_date')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),
    ]);

    // Check if we have data
    const summary = venueDayResult.data as any;
    if (!summary) {
      return NextResponse.json({
        date,
        venue_id: venueId,
        has_data: false,
        message: 'No fact data for this date. Data may not be synced yet.',
      });
    }

    // Labor data: prefer synced labor_day_facts, fall back to live TipSee query
    const laborFact = laborFactResult.data as any;
    const buildDeptBreakdown = (hours: number, cost: number, empCount: number) =>
      (hours > 0 || cost > 0) ? { hours, cost, employee_count: empCount } : null;

    let laborData = laborFact
      ? {
          total_hours: laborFact.total_hours,
          labor_cost: laborFact.labor_cost,
          labor_pct: laborFact.labor_pct,
          splh: laborFact.splh,
          ot_hours: laborFact.ot_hours,
          covers_per_labor_hour: laborFact.covers_per_labor_hour,
          employee_count: laborFact.employee_count,
          foh: buildDeptBreakdown(laborFact.foh_hours || 0, laborFact.foh_cost || 0, laborFact.foh_employee_count || 0),
          boh: buildDeptBreakdown(laborFact.boh_hours || 0, laborFact.boh_cost || 0, laborFact.boh_employee_count || 0),
          other: buildDeptBreakdown(laborFact.other_hours || 0, laborFact.other_cost || 0, laborFact.other_employee_count || 0),
        }
      : null;

    let laborWarning: string | null = null;

    // Fallback: live query TipSee if no synced data
    if (!laborData && tipseeLocationUuid) {
      try {
        const liveLaborData = await fetchLaborSummary(
          tipseeLocationUuid,
          date,
          summary.net_sales || 0,
          summary.covers_count || 0
        );
        if (liveLaborData) {
          laborData = {
            total_hours: liveLaborData.total_hours,
            labor_cost: liveLaborData.labor_cost,
            labor_pct: liveLaborData.labor_pct,
            splh: liveLaborData.splh,
            ot_hours: liveLaborData.ot_hours,
            covers_per_labor_hour: liveLaborData.covers_per_labor_hour,
            employee_count: liveLaborData.employee_count,
            foh: liveLaborData.foh,
            boh: liveLaborData.boh,
            other: liveLaborData.other,
          };
        } else {
          laborWarning = 'Labor data unavailable from TipSee';
        }
      } catch (laborErr: any) {
        console.error('Error fetching live TipSee labor:', laborErr);
        laborWarning = `Labor data error: ${laborErr.message || 'Failed to fetch from TipSee'}`;
      }
    } else if (!laborData && !tipseeLocationUuid) {
      laborWarning = 'No TipSee location mapping configured for labor data';
    }

    // Process demand forecasts (with bias correction applied)
    const forecast = forecastResult.data as any;
    const coversForecast = forecast ? {
      yhat: forecast.covers_predicted,
      yhat_lower: forecast.covers_lower,
      yhat_upper: forecast.covers_upper,
      raw: forecast.covers_raw,
      bias_corrected: forecast.bias_corrected,
    } : null;
    const salesForecast = forecast ? {
      yhat: forecast.revenue_predicted,
    } : null;

    // SDLW and SDLY data (may be null if no data exists)
    const sdlw = sdlwResult.data as any;
    const sdly = sdlyResult.data as any;

    // Aggregate PTD totals
    const ptdThisWeek = (ptdThisWeekResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );
    const ptdLastWeek = (ptdLastWeekResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );

    // Aggregate WTD totals (calendar week: Monday → selected date)
    const wtdThisWeek = (wtdThisWeekResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );
    const wtdLastWeek = (wtdLastWeekResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );

    // Calculate variance percentages
    const calcVariance = (actual: number, comparison: number | null | undefined): number | null => {
      if (!comparison || comparison === 0) return null;
      return ((actual - comparison) / comparison) * 100;
    };

    const actualNetSales = summary.net_sales || 0;
    const actualCovers = summary.covers_count || 0;

    // Aggregate server data across date ranges (WTD and PTD)
    function aggregateServerData(rows: any[]): any[] {
      const byServer = new Map<string, {
        employee_name: string;
        employee_role: string;
        gross_sales: number;
        checks_count: number;
        covers_count: number;
        tips_total: number;
        turn_mins_sum: number;
        turn_mins_count: number;
        days: Set<string>;
      }>();

      for (const row of rows) {
        const key = row.employee_name;
        const existing = byServer.get(key) || {
          employee_name: row.employee_name,
          employee_role: row.employee_role || '',
          gross_sales: 0, checks_count: 0, covers_count: 0,
          tips_total: 0, turn_mins_sum: 0, turn_mins_count: 0,
          days: new Set<string>(),
        };
        existing.gross_sales += row.gross_sales || 0;
        existing.checks_count += row.checks_count || 0;
        existing.covers_count += row.covers_count || 0;
        existing.tips_total += row.tips_total || 0;
        if (row.avg_turn_mins > 0) {
          existing.turn_mins_sum += row.avg_turn_mins;
          existing.turn_mins_count++;
        }
        existing.days.add(row.business_date);
        byServer.set(key, existing);
      }

      return Array.from(byServer.values())
        .map((s) => ({
          employee_name: s.employee_name,
          employee_role_name: s.employee_role,
          tickets: s.checks_count,
          covers: s.covers_count,
          net_sales: s.gross_sales,
          avg_ticket: s.checks_count > 0 ? Math.round((s.gross_sales / s.checks_count) * 100) / 100 : 0,
          avg_turn_mins: s.turn_mins_count > 0 ? Math.round(s.turn_mins_sum / s.turn_mins_count) : 0,
          avg_per_cover: s.covers_count > 0 ? Math.round((s.gross_sales / s.covers_count) * 100) / 100 : 0,
          tip_pct: s.gross_sales > 0 && s.tips_total > 0 ? Math.round((s.tips_total / s.gross_sales) * 1000) / 10 : null,
          total_tips: s.tips_total,
          days_worked: s.days.size,
        }))
        .sort((a, b) => b.net_sales - a.net_sales);
    }

    const serversWtd = aggregateServerData(serverWtdResult.data || []);
    const serversPtd = aggregateServerData(serverPtdResult.data || []);

    // Format response to match existing NightlyReportData structure
    const response = {
      date,
      venue_id: venueId,
      has_data: true,
      last_synced_at: summary.last_synced_at,

      summary: {
        trading_day: summary.business_date,
        total_checks: summary.checks_count,
        total_covers: summary.covers_count,
        gross_sales: summary.gross_sales,
        net_sales: summary.net_sales,
        sub_total: summary.net_sales,
        total_tax: summary.taxes_total,
        total_comps: summary.comps_total,
        total_voids: summary.voids_total,
        tips_total: summary.tips_total,
        food_sales: summary.food_sales,
        beverage_sales: summary.beverage_sales,
        wine_sales: summary.wine_sales,
        liquor_sales: summary.liquor_sales,
        beer_sales: summary.beer_sales,
        avg_check: summary.avg_check,
        avg_cover: summary.avg_cover,
        beverage_pct: summary.beverage_pct,
      },

      salesByCategory: (categoryResult.data || []).map((cat: any) => ({
        category: cat.category,
        net_sales: cat.gross_sales,
        comps: cat.comps_total,
        voids: cat.voids_total,
        quantity: cat.quantity_sold,
      })),

      servers: (serverResult.data || []).map((server: any) => ({
        employee_name: server.employee_name,
        employee_role_name: server.employee_role,
        tickets: server.checks_count,
        covers: server.covers_count,
        net_sales: server.gross_sales,
        avg_ticket: server.avg_check,
        avg_turn_mins: server.avg_turn_mins,
        avg_per_cover: server.avg_per_cover,
        tip_pct: server.gross_sales > 0 && server.tips_total != null
          ? Math.round((server.tips_total / server.gross_sales) * 1000) / 10
          : null,
        total_tips: server.tips_total || 0,
      })),

      menuItems: (itemResult.data || []).map((item: any) => ({
        name: item.menu_item_name,
        qty: item.quantity_sold,
        net_total: item.gross_sales,
        category: item.parent_category,
      })),

      labor: laborData,
      labor_warning: laborWarning,

      // Demand forecast data (with bias correction)
      forecast: {
        net_sales: salesForecast?.yhat || null,
        net_sales_lower: null, // Not available in demand_forecasts
        net_sales_upper: null,
        covers: coversForecast?.yhat || null,
        covers_lower: coversForecast?.yhat_lower || null,
        covers_upper: coversForecast?.yhat_upper || null,
        covers_raw: coversForecast?.raw || null, // Raw before bias correction
        bias_corrected: coversForecast?.bias_corrected || false,
      },

      // Variance comparisons
      variance: {
        // vs Forecast
        vs_forecast_pct: calcVariance(actualNetSales, salesForecast?.yhat),
        vs_forecast_covers_pct: calcVariance(actualCovers, coversForecast?.yhat),
        // vs Same Day Last Week
        sdlw_net_sales: sdlw?.net_sales || null,
        sdlw_covers: sdlw?.covers_count || null,
        vs_sdlw_pct: calcVariance(actualNetSales, sdlw?.net_sales),
        vs_sdlw_covers_pct: calcVariance(actualCovers, sdlw?.covers_count),
        // vs Same Day Last Year
        sdly_net_sales: sdly?.net_sales || null,
        sdly_covers: sdly?.covers_count || null,
        vs_sdly_pct: calcVariance(actualNetSales, sdly?.net_sales),
        vs_sdly_covers_pct: calcVariance(actualCovers, sdly?.covers_count),
        // PTD (Period-to-Date): fiscal period start → selected date vs same period last week
        ptd_net_sales: ptdThisWeek.net_sales,
        ptd_covers: ptdThisWeek.covers,
        ptd_lw_net_sales: ptdLastWeek.net_sales,
        ptd_lw_covers: ptdLastWeek.covers,
        vs_ptd_pct: calcVariance(ptdThisWeek.net_sales, ptdLastWeek.net_sales),
        vs_ptd_covers_pct: calcVariance(ptdThisWeek.covers, ptdLastWeek.covers),
        // WTD (Week-to-Date): calendar week Monday → selected date vs same days last week
        wtd_net_sales: wtdThisWeek.net_sales,
        wtd_covers: wtdThisWeek.covers,
        wtd_lw_net_sales: wtdLastWeek.net_sales,
        wtd_lw_covers: wtdLastWeek.covers,
        vs_wtd_pct: calcVariance(wtdThisWeek.net_sales, wtdLastWeek.net_sales),
        vs_wtd_covers_pct: calcVariance(wtdThisWeek.covers, wtdLastWeek.covers),
        // Debug: date ranges being queried
        _debug: {
          wtd_range: `${weekStartStr} → ${date}`,
          wtd_lw_range: `${lastWeekWeekStartStr} → ${lastWeekSameDayStr}`,
          ptd_range: `${periodStartStr} → ${date}`,
          ptd_lp_range: `${prevPeriodStartStr} → ${prevPeriodEndStr}`,
          days_into_period: daysIntoPeriod,
        },
      },

      // Fiscal calendar info
      fiscal: {
        calendar_type: fiscalCalendarType,
        fy_start_date: fiscalYearStartDate,
        fiscal_year: fiscalPeriod.fiscalYear,
        fiscal_quarter: fiscalPeriod.fiscalQuarter,
        fiscal_period: fiscalPeriod.fiscalPeriod,
        period_start_date: fiscalPeriod.periodStartDate,
        period_end_date: fiscalPeriod.periodEndDate,
        week_in_period: fiscalPeriod.weekInPeriod,
      },

      // Aggregated server performance for WTD and PTD
      servers_wtd: serversWtd,
      servers_ptd: serversPtd,
    };

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('Nightly facts API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch facts' },
      { status: 500 }
    );
  }
}
