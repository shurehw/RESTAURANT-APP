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

    // Fetch fiscal calendar settings for the venue's organization
    const { data: venueData } = await (supabase as any)
      .from('venues')
      .select('organization_id')
      .eq('id', venueId)
      .single();

    let fiscalCalendarType: FiscalCalendarType = 'standard';
    let fiscalYearStartDate: string | null = null;

    if (venueData?.organization_id) {
      const { data: settingsData } = await (supabase as any)
        .from('proforma_settings')
        .select('fiscal_calendar_type, fiscal_year_start_date')
        .eq('org_id', venueData.organization_id)
        .single();

      if (settingsData) {
        fiscalCalendarType = settingsData.fiscal_calendar_type || 'standard';
        fiscalYearStartDate = settingsData.fiscal_year_start_date;
      }
    }

    // Get fiscal period info for PTD calculation
    const fiscalPeriod = getFiscalPeriod(date, fiscalCalendarType, fiscalYearStartDate);

    // PTD (Period-to-Date): Start of fiscal period → selected date
    const periodStartStr = fiscalPeriod.periodStartDate;

    // Same period last week (go back 7 days within fiscal context)
    const lastWeekDate = new Date(currentDate);
    lastWeekDate.setDate(lastWeekDate.getDate() - 7);
    const lastWeekFiscalPeriod = getFiscalPeriod(lastWeekDate.toISOString().split('T')[0], fiscalCalendarType, fiscalYearStartDate);
    const lastWeekPeriodStartStr = lastWeekFiscalPeriod.periodStartDate;
    const lastWeekEndStr = lastWeekDate.toISOString().split('T')[0];

    // Fetch all fact data in parallel
    const [
      venueDayResult,
      categoryResult,
      serverResult,
      itemResult,
      laborResult,
      timePunchesResult,
      forecastResult,
      sdlwResult,
      sdlyResult,
      ptdThisWeekResult,
      ptdLastWeekResult,
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

      // Labor efficiency
      (supabase as any)
        .from('labor_efficiency_daily')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .maybeSingle(),

      // Time punches for OT calculation
      (supabase as any)
        .from('time_punches')
        .select('user_id, clock_in, clock_out')
        .eq('venue_id', venueId)
        .gte('clock_in', `${date}T00:00:00`)
        .lte('clock_in', `${date}T23:59:59`)
        .not('clock_out', 'is', null),

      // Prophet forecasts for current date (net_sales and covers)
      (supabase as any)
        .from('venue_day_forecast')
        .select('forecast_type, yhat, yhat_lower, yhat_upper')
        .eq('venue_id', venueId)
        .eq('business_date', date),

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

      // PTD Last Period (same relative period last week)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', lastWeekPeriodStartStr)
        .lte('business_date', lastWeekEndStr),
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

    // Calculate OT hours (hours over 8 per employee per day)
    const timePunches = timePunchesResult.data || [];
    const employeeHours: Record<string, number> = {};
    for (const punch of timePunches) {
      if (!punch.clock_out) continue;
      const hoursWorked =
        (new Date(punch.clock_out).getTime() - new Date(punch.clock_in).getTime()) /
        (1000 * 60 * 60);
      employeeHours[punch.user_id] = (employeeHours[punch.user_id] || 0) + hoursWorked;
    }
    const otHours = Object.values(employeeHours).reduce((sum, hours) => {
      return sum + Math.max(0, hours - 8);
    }, 0);

    // Labor data
    const labor = laborResult.data as any;

    // Process Prophet forecasts (grouped by forecast_type)
    const forecasts = forecastResult.data || [];
    const salesForecast = forecasts.find((f: any) => f.forecast_type === 'net_sales');
    const coversForecast = forecasts.find((f: any) => f.forecast_type === 'covers');

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

    // Calculate variance percentages
    const calcVariance = (actual: number, comparison: number | null | undefined): number | null => {
      if (!comparison || comparison === 0) return null;
      return ((actual - comparison) / comparison) * 100;
    };

    const actualNetSales = summary.net_sales || 0;
    const actualCovers = summary.covers_count || 0;

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
      })),

      menuItems: (itemResult.data || []).map((item: any) => ({
        name: item.menu_item_name,
        qty: item.quantity_sold,
        net_total: item.gross_sales,
        category: item.parent_category,
      })),

      labor: labor
        ? {
            total_hours: labor.total_labor_hours,
            labor_cost: labor.labor_cost,
            labor_pct: labor.labor_cost_pct,
            splh: labor.sales_per_labor_hour,
            ot_hours: otHours,
            covers_per_labor_hour:
              labor.total_labor_hours > 0
                ? summary.covers_count / labor.total_labor_hours
                : null,
          }
        : null,

      // Prophet forecast data
      forecast: {
        net_sales: salesForecast?.yhat || null,
        net_sales_lower: salesForecast?.yhat_lower || null,
        net_sales_upper: salesForecast?.yhat_upper || null,
        covers: coversForecast?.yhat || null,
        covers_lower: coversForecast?.yhat_lower || null,
        covers_upper: coversForecast?.yhat_upper || null,
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
