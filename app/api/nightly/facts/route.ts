/**
 * Nightly Facts API
 * Fetches pre-aggregated data from fact tables (faster than live TipSee queries)
 *
 * GET /api/nightly/facts?date=2024-01-15&venue_id=xxx
 * GET /api/nightly/facts?action=mappings - Get venue-TipSee mappings
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getFiscalPeriod, getFiscalYearStart, getAllPeriodsInFiscalYear, getSamePeriodLastYear, FiscalCalendarType } from '@/lib/fiscal-calendar';
import { fetchLaborSummary } from '@/lib/database/tipsee'; // Fallback for live query

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');
  const date = searchParams.get('date');
  const venueId = searchParams.get('venue_id');
  const viewMode = searchParams.get('view') || 'nightly'; // 'nightly' | 'wtd' | 'ptd' | 'ytd'

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
        .from('organization_settings')
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

    // SWLY (Same Week Last Year): Same Mon→DOW range but ~52 weeks back
    const swlyWeekStart = new Date(weekStartDate);
    swlyWeekStart.setFullYear(swlyWeekStart.getFullYear() - 1);
    // Align to Monday of that week (year shift may land on different DOW)
    const swlyDow = swlyWeekStart.getDay();
    const swlyDaysFromMon = swlyDow === 0 ? 6 : swlyDow - 1;
    swlyWeekStart.setDate(swlyWeekStart.getDate() - swlyDaysFromMon);
    const swlyWeekStartStr = swlyWeekStart.toISOString().split('T')[0];
    // Same number of days into the week
    const swlyWeekEnd = new Date(swlyWeekStart);
    swlyWeekEnd.setDate(swlyWeekEnd.getDate() + daysFromMonday);
    const swlyWeekEndStr = swlyWeekEnd.toISOString().split('T')[0];

    // PTD SPLY (Same Period Last Year): for year-over-year period comparison
    const ptdSply = getSamePeriodLastYear(date, fiscalCalendarType, fiscalYearStartDate);

    // YTD (Year-to-Date): FY start → selected date
    const fyStartStr = getFiscalYearStart(date, fiscalCalendarType, fiscalYearStartDate);

    // YTD prior year: same FY start last year → equivalent date last year
    const fyStartParts = fyStartStr.split('-').map(Number);
    const fyStartDateObj = new Date(fyStartParts[0], fyStartParts[1] - 1, fyStartParts[2]);
    const daysIntoFY = Math.floor((targetDate.getTime() - fyStartDateObj.getTime()) / (24 * 60 * 60 * 1000));
    const lyFyStartDateObj = new Date(fyStartDateObj);
    lyFyStartDateObj.setFullYear(lyFyStartDateObj.getFullYear() - 1);
    const lyFyStartStr = lyFyStartDateObj.toISOString().split('T')[0];
    const lyFyEndDateObj = new Date(lyFyStartDateObj);
    lyFyEndDateObj.setDate(lyFyEndDateObj.getDate() + daysIntoFY);
    const lyFyEndStr = lyFyEndDateObj.toISOString().split('T')[0];

    // ══════════════════════════════════════════════════════════════════════════
    // CONDITIONAL QUERY FETCHING (Performance Optimization)
    // ══════════════════════════════════════════════════════════════════════════
    // Strategy: Always fetch core nightly data + variance comparisons (12 queries)
    // Only fetch expensive period aggregations when WTD/PTD view is active (8 queries)
    // Savings: ~60% fewer queries in nightly view (12 vs 20)

    // Core queries (always needed - 12 queries)
    const coreQueries = [
      // 1. Venue day facts (summary)
      (supabase as any)
        .from('venue_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .single(),

      // 2. Category breakdown
      (supabase as any)
        .from('category_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false }),

      // 3. Server performance
      (supabase as any)
        .from('server_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false }),

      // 4. Menu items
      (supabase as any)
        .from('item_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .order('gross_sales', { ascending: false })
        .limit(15),

      // 5. Labor day facts
      (supabase as any)
        .from('labor_day_facts')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .maybeSingle(),

      // 6. Demand forecasts
      (supabase as any)
        .from('forecasts_with_bias')
        .select('covers_predicted, covers_lower, covers_upper, revenue_predicted, covers_raw, bias_corrected')
        .eq('venue_id', venueId)
        .eq('business_date', date)
        .maybeSingle(),

      // 7. SDLW (Same Day Last Week)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count, beverage_pct')
        .eq('venue_id', venueId)
        .eq('business_date', sdlwDateStr)
        .maybeSingle(),

      // 8. SDLY (Same Day Last Year)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count, beverage_pct')
        .eq('venue_id', venueId)
        .eq('business_date', sdlyDateStr)
        .maybeSingle(),

      // 9. PTD This Period (for variance calculations)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),

      // 10. PTD Last Period (for variance calculations)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', prevPeriodStartStr)
        .lte('business_date', prevPeriodEndStr),

      // 11. WTD This Week (for variance calculations)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),

      // 12. WTD Last Week (for variance calculations)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', lastWeekWeekStartStr)
        .lte('business_date', lastWeekSameDayStr),

      // 13. SWLY - Same Week Last Year (Mon→DOW, ~52 weeks back)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', swlyWeekStartStr)
        .lte('business_date', swlyWeekEndStr),

      // 14. PTD Same Period Last Year (for SPLY comparison)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', ptdSply.startDate)
        .lte('business_date', ptdSply.endDate),

      // 15. YTD This Year (for YTD variance)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', fyStartStr)
        .lte('business_date', date),

      // 16. YTD Last Year (for YTD variance)
      (supabase as any)
        .from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', lyFyStartStr)
        .lte('business_date', lyFyEndStr),
    ];

    // Period aggregation queries (only when WTD/PTD/YTD view active)
    const wtdQueries = viewMode === 'wtd' || viewMode === 'ptd' ? [
      // 13. Server WTD
      (supabase as any)
        .from('server_day_facts')
        .select('employee_name, employee_role, gross_sales, checks_count, covers_count, tips_total, avg_turn_mins, business_date')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),

      // 14. Category WTD
      (supabase as any)
        .from('category_day_facts')
        .select('category, gross_sales, comps_total, voids_total, quantity_sold')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),

      // 15. Items WTD
      (supabase as any)
        .from('item_day_facts')
        .select('menu_item_name, gross_sales, quantity_sold, parent_category')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),

      // 16. Labor WTD
      (supabase as any)
        .from('labor_day_facts')
        .select('total_hours, labor_cost, ot_hours, employee_count, foh_hours, foh_cost, foh_employee_count, boh_hours, boh_cost, boh_employee_count, other_hours, other_cost, other_employee_count')
        .eq('venue_id', venueId)
        .gte('business_date', weekStartStr)
        .lte('business_date', date),
    ] : [];

    const ptdQueries = viewMode === 'ptd' ? [
      // 17. Server PTD
      (supabase as any)
        .from('server_day_facts')
        .select('employee_name, employee_role, gross_sales, checks_count, covers_count, tips_total, avg_turn_mins, business_date')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),

      // 18. Category PTD
      (supabase as any)
        .from('category_day_facts')
        .select('category, gross_sales, comps_total, voids_total, quantity_sold')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),

      // 19. Items PTD
      (supabase as any)
        .from('item_day_facts')
        .select('menu_item_name, gross_sales, quantity_sold, parent_category')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),

      // 20. Labor PTD
      (supabase as any)
        .from('labor_day_facts')
        .select('total_hours, labor_cost, ot_hours, employee_count, foh_hours, foh_cost, foh_employee_count, boh_hours, boh_cost, boh_employee_count, other_hours, other_cost, other_employee_count')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date),

      // 21. PTD daily facts (for week breakdown) - current period
      (supabase as any)
        .from('venue_day_facts')
        .select('business_date, net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', periodStartStr)
        .lte('business_date', date)
        .order('business_date'),

      // 22. PTD daily facts (for week breakdown) - previous period
      (supabase as any)
        .from('venue_day_facts')
        .select('business_date, net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', prevPeriodStartStr)
        .lte('business_date', prevPeriodEndStr)
        .order('business_date'),
    ] : [];

    // YTD aggregation queries (only when YTD view active)
    const ytdQueries = viewMode === 'ytd' ? [
      // Server YTD
      (supabase as any)
        .from('server_day_facts')
        .select('employee_name, employee_role, gross_sales, checks_count, covers_count, tips_total, avg_turn_mins, business_date')
        .eq('venue_id', venueId)
        .gte('business_date', fyStartStr)
        .lte('business_date', date),

      // Category YTD
      (supabase as any)
        .from('category_day_facts')
        .select('category, gross_sales, comps_total, voids_total, quantity_sold')
        .eq('venue_id', venueId)
        .gte('business_date', fyStartStr)
        .lte('business_date', date),

      // Items YTD
      (supabase as any)
        .from('item_day_facts')
        .select('menu_item_name, gross_sales, quantity_sold, parent_category')
        .eq('venue_id', venueId)
        .gte('business_date', fyStartStr)
        .lte('business_date', date),

      // Labor YTD
      (supabase as any)
        .from('labor_day_facts')
        .select('total_hours, labor_cost, ot_hours, employee_count, foh_hours, foh_cost, foh_employee_count, boh_hours, boh_cost, boh_employee_count, other_hours, other_cost, other_employee_count')
        .eq('venue_id', venueId)
        .gte('business_date', fyStartStr)
        .lte('business_date', date),

      // YTD daily facts (for period breakdown) - current year
      (supabase as any)
        .from('venue_day_facts')
        .select('business_date, net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', fyStartStr)
        .lte('business_date', date)
        .order('business_date'),

      // YTD daily facts (for period breakdown) - prior year
      (supabase as any)
        .from('venue_day_facts')
        .select('business_date, net_sales, covers_count')
        .eq('venue_id', venueId)
        .gte('business_date', lyFyStartStr)
        .lte('business_date', lyFyEndStr)
        .order('business_date'),
    ] : [];

    // Combine and execute all queries
    const allQueries = [...coreQueries, ...wtdQueries, ...ptdQueries, ...ytdQueries];
    const results = await Promise.all(allQueries);

    // Destructure results (always have 16 core, optionally 4 WTD, optionally 6 PTD, optionally 6 YTD)
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
      swlyResult,          // 13. Same Week Last Year
      ptdSplyResult,       // 14. PTD Same Period Last Year
      ytdThisYearResult,   // 15. YTD This Year
      ytdLastYearResult,   // 16. YTD Last Year
    ] = results;

    // WTD results (if fetched) - start at index 16
    const wtdOffset = 16;
    const serverWtdResult = viewMode === 'wtd' || viewMode === 'ptd' ? results[wtdOffset] : { data: [] };
    const categoryWtdResult = viewMode === 'wtd' || viewMode === 'ptd' ? results[wtdOffset + 1] : { data: [] };
    const itemWtdResult = viewMode === 'wtd' || viewMode === 'ptd' ? results[wtdOffset + 2] : { data: [] };
    const laborWtdResult = viewMode === 'wtd' || viewMode === 'ptd' ? results[wtdOffset + 3] : { data: [] };

    // PTD results (if fetched) - offset after WTD queries
    const ptdOffset = wtdOffset + (viewMode === 'wtd' || viewMode === 'ptd' ? 4 : 0);
    const serverPtdResult = viewMode === 'ptd' ? results[ptdOffset] : { data: [] };
    const categoryPtdResult = viewMode === 'ptd' ? results[ptdOffset + 1] : { data: [] };
    const itemPtdResult = viewMode === 'ptd' ? results[ptdOffset + 2] : { data: [] };
    const laborPtdResult = viewMode === 'ptd' ? results[ptdOffset + 3] : { data: [] };
    const ptdDailyCurrentResult = viewMode === 'ptd' ? results[ptdOffset + 4] : { data: [] };
    const ptdDailyPriorResult = viewMode === 'ptd' ? results[ptdOffset + 5] : { data: [] };

    // YTD results (if fetched) - offset after PTD queries
    const ytdOffset = ptdOffset + (viewMode === 'ptd' ? 6 : 0);
    const serverYtdResult = viewMode === 'ytd' ? results[ytdOffset] : { data: [] };
    const categoryYtdResult = viewMode === 'ytd' ? results[ytdOffset + 1] : { data: [] };
    const itemYtdResult = viewMode === 'ytd' ? results[ytdOffset + 2] : { data: [] };
    const laborYtdResult = viewMode === 'ytd' ? results[ytdOffset + 3] : { data: [] };
    const ytdDailyCurrentResult = viewMode === 'ytd' ? results[ytdOffset + 4] : { data: [] };
    const ytdDailyPriorResult = viewMode === 'ytd' ? results[ytdOffset + 5] : { data: [] };

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

    // Aggregate PTD SPLY totals
    const ptdSplyTotals = (ptdSplyResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );

    // Aggregate YTD totals
    const ytdThisYear = (ytdThisYearResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );
    const ytdLastYear = (ytdLastYearResult.data || []).reduce(
      (acc: { net_sales: number; covers: number }, row: any) => ({
        net_sales: acc.net_sales + (row.net_sales || 0),
        covers: acc.covers + (row.covers_count || 0),
      }),
      { net_sales: 0, covers: 0 }
    );

    // Aggregate PTD totals
    const ptdCurrent = (ptdThisWeekResult.data || []).reduce(
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
    const swlyTotals = (swlyResult.data || []).reduce(
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

    // Aggregate category data across date ranges
    function aggregateCategories(rows: any[]): any[] {
      const byCategory = new Map<string, {
        sales: number;
        comps: number;
        voids: number;
        qty: number;
      }>();

      for (const row of rows) {
        const category = row.category || 'Other';
        const existing = byCategory.get(category) || { sales: 0, comps: 0, voids: 0, qty: 0 };
        existing.sales += row.gross_sales || 0;
        existing.comps += row.comps_total || 0;
        existing.voids += row.voids_total || 0;
        existing.qty += row.quantity_sold || 0;
        byCategory.set(category, existing);
      }

      return Array.from(byCategory.entries())
        .map(([category, data]) => ({
          category,
          gross_sales: data.sales,
          comps: data.comps,
          voids: data.voids,
          net_sales: data.sales - data.comps - data.voids,
          quantity: data.qty,
        }))
        .sort((a, b) => b.net_sales - a.net_sales);
    }

    // Aggregate menu items across date ranges
    function aggregateItems(rows: any[]): any[] {
      const byItem = new Map<string, {
        name: string;
        sales: number;
        qty: number;
        category: string;
      }>();

      for (const row of rows) {
        const name = row.menu_item_name;
        const existing = byItem.get(name) || {
          name,
          sales: 0,
          qty: 0,
          category: row.parent_category || 'Other',
        };
        existing.sales += row.gross_sales || 0;
        existing.qty += row.quantity_sold || 0;
        byItem.set(name, existing);
      }

      return Array.from(byItem.values())
        .map((item) => ({
          name: item.name,
          qty: item.qty,
          net_total: item.sales,
          category: item.category,
        }))
        .sort((a, b) => b.net_total - a.net_total)
        .slice(0, 15); // Top 15 items
    }

    // Aggregate labor data across date ranges
    function aggregateLabor(rows: any[], totalNetSales: number, totalCovers: number): any {
      if (!rows || rows.length === 0) return null;

      const totals = rows.reduce((acc, row) => ({
        total_hours: acc.total_hours + (row.total_hours || 0),
        labor_cost: acc.labor_cost + (row.labor_cost || 0),
        ot_hours: acc.ot_hours + (row.ot_hours || 0),
        employee_count: Math.max(acc.employee_count, row.employee_count || 0), // Max employees in any single day
        foh_hours: acc.foh_hours + (row.foh_hours || 0),
        foh_cost: acc.foh_cost + (row.foh_cost || 0),
        foh_employee_count: Math.max(acc.foh_employee_count, row.foh_employee_count || 0),
        boh_hours: acc.boh_hours + (row.boh_hours || 0),
        boh_cost: acc.boh_cost + (row.boh_cost || 0),
        boh_employee_count: Math.max(acc.boh_employee_count, row.boh_employee_count || 0),
        other_hours: acc.other_hours + (row.other_hours || 0),
        other_cost: acc.other_cost + (row.other_cost || 0),
        other_employee_count: Math.max(acc.other_employee_count, row.other_employee_count || 0),
      }), {
        total_hours: 0,
        labor_cost: 0,
        ot_hours: 0,
        employee_count: 0,
        foh_hours: 0,
        foh_cost: 0,
        foh_employee_count: 0,
        boh_hours: 0,
        boh_cost: 0,
        boh_employee_count: 0,
        other_hours: 0,
        other_cost: 0,
        other_employee_count: 0,
      });

      const buildDeptBreakdown = (hours: number, cost: number, empCount: number) =>
        (hours > 0 || cost > 0) ? { hours, cost, employee_count: empCount } : null;

      return {
        total_hours: totals.total_hours,
        labor_cost: totals.labor_cost,
        labor_pct: totalNetSales > 0 ? (totals.labor_cost / totalNetSales) * 100 : 0,
        splh: totals.total_hours > 0 ? totalNetSales / totals.total_hours : 0,
        ot_hours: totals.ot_hours,
        covers_per_labor_hour: totals.total_hours > 0 ? totalCovers / totals.total_hours : 0,
        employee_count: totals.employee_count,
        foh: buildDeptBreakdown(totals.foh_hours, totals.foh_cost, totals.foh_employee_count),
        boh: buildDeptBreakdown(totals.boh_hours, totals.boh_cost, totals.boh_employee_count),
        other: buildDeptBreakdown(totals.other_hours, totals.other_cost, totals.other_employee_count),
      };
    }

    const serversWtd = aggregateServerData(serverWtdResult.data || []);
    const serversPtd = aggregateServerData(serverPtdResult.data || []);

    const categoriesWtd = aggregateCategories(categoryWtdResult.data || []);
    const categoriesPtd = aggregateCategories(categoryPtdResult.data || []);

    const itemsWtd = aggregateItems(itemWtdResult.data || []);
    const itemsPtd = aggregateItems(itemPtdResult.data || []);

    const laborWtd = aggregateLabor(
      laborWtdResult.data || [],
      wtdThisWeek.net_sales,
      wtdThisWeek.covers
    );
    const laborPtd = aggregateLabor(
      laborPtdResult.data || [],
      ptdCurrent.net_sales,
      ptdCurrent.covers
    );

    // YTD aggregations
    const serversYtd = aggregateServerData(serverYtdResult.data || []);
    const categoriesYtd = aggregateCategories(categoryYtdResult.data || []);
    const itemsYtd = aggregateItems(itemYtdResult.data || []);
    const laborYtd = aggregateLabor(
      laborYtdResult.data || [],
      ytdThisYear.net_sales,
      ytdThisYear.covers
    );

    // ══════════════════════════════════════════════════════════════════════════
    // PTD WEEK BREAKDOWN (bucket daily facts into 7-day weeks within period)
    // ══════════════════════════════════════════════════════════════════════════
    let ptdWeeks: any[] = [];
    if (viewMode === 'ptd') {
      const currentDays = (ptdDailyCurrentResult.data || []) as any[];
      const priorDays = (ptdDailyPriorResult.data || []) as any[];

      // Determine weeks in this period from fiscal calendar
      const periodInfo = getFiscalPeriod(date, fiscalCalendarType, fiscalYearStartDate);
      const prevInfo = getFiscalPeriod(
        new Date(new Date(periodInfo.periodStartDate).getTime() - 86400000).toISOString().split('T')[0],
        fiscalCalendarType,
        fiscalYearStartDate
      );

      // Build week buckets for current period
      const pStartParts = periodStartStr.split('-').map(Number);
      const pStart = new Date(pStartParts[0], pStartParts[1] - 1, pStartParts[2]);
      const ppStartParts = prevPeriodStartStr.split('-').map(Number);
      const ppStart = new Date(ppStartParts[0], ppStartParts[1] - 1, ppStartParts[2]);

      // Figure out how many weeks in the period (from fiscal pattern)
      const pattern = fiscalCalendarType === 'standard'
        ? [4, 4, 5]
        : (fiscalCalendarType === '4-4-5' ? [4, 4, 5] : fiscalCalendarType === '4-5-4' ? [4, 5, 4] : [5, 4, 4]);
      const periodInQuarter = ((periodInfo.fiscalPeriod - 1) % 3);
      const weeksInPeriod = fiscalCalendarType === 'standard' ? Math.ceil((new Date(periodInfo.periodEndDate).getDate()) / 7) : pattern[periodInQuarter];
      const prevPeriodInQuarter = ((prevInfo.fiscalPeriod - 1) % 3);
      const weeksInPrevPeriod = fiscalCalendarType === 'standard' ? Math.ceil((new Date(prevInfo.periodEndDate).getDate()) / 7) : pattern[prevPeriodInQuarter];

      for (let w = 0; w < weeksInPeriod; w++) {
        const weekStart = new Date(pStart);
        weekStart.setDate(weekStart.getDate() + w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        const wsStr = weekStart.toISOString().split('T')[0];
        const weStr = weekEnd.toISOString().split('T')[0];

        const weekSales = currentDays
          .filter((d: any) => d.business_date >= wsStr && d.business_date <= weStr)
          .reduce((sum: number, d: any) => sum + (d.net_sales || 0), 0);
        const weekCovers = currentDays
          .filter((d: any) => d.business_date >= wsStr && d.business_date <= weStr)
          .reduce((sum: number, d: any) => sum + (d.covers_count || 0), 0);

        // Prior period same week
        let priorSales: number | null = null;
        let priorCovers: number | null = null;
        if (w < weeksInPrevPeriod) {
          const priorWeekStart = new Date(ppStart);
          priorWeekStart.setDate(priorWeekStart.getDate() + w * 7);
          const priorWeekEnd = new Date(priorWeekStart);
          priorWeekEnd.setDate(priorWeekEnd.getDate() + 6);
          const pwsStr = priorWeekStart.toISOString().split('T')[0];
          const pweStr = priorWeekEnd.toISOString().split('T')[0];

          priorSales = priorDays
            .filter((d: any) => d.business_date >= pwsStr && d.business_date <= pweStr)
            .reduce((sum: number, d: any) => sum + (d.net_sales || 0), 0);
          priorCovers = priorDays
            .filter((d: any) => d.business_date >= pwsStr && d.business_date <= pweStr)
            .reduce((sum: number, d: any) => sum + (d.covers_count || 0), 0);
        }

        ptdWeeks.push({
          week: w + 1,
          label: `Week ${w + 1}`,
          start_date: wsStr,
          end_date: weStr > date ? date : weStr,
          net_sales: weekSales,
          covers: weekCovers,
          prior_net_sales: priorSales,
          prior_covers: priorCovers,
        });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // YTD PERIOD BREAKDOWN (bucket daily facts into fiscal periods)
    // ══════════════════════════════════════════════════════════════════════════
    let ytdPeriods: any[] = [];
    if (viewMode === 'ytd') {
      const currentDays = (ytdDailyCurrentResult.data || []) as any[];
      const priorDays = (ytdDailyPriorResult.data || []) as any[];

      const allPeriods = getAllPeriodsInFiscalYear(fyStartStr, fiscalCalendarType);
      const lyAllPeriods = getAllPeriodsInFiscalYear(lyFyStartStr, fiscalCalendarType);

      for (let i = 0; i < allPeriods.length; i++) {
        const period = allPeriods[i];
        // Only include periods that have started (period start <= date)
        if (period.startDate > date) break;

        const effectiveEnd = period.endDate > date ? date : period.endDate;

        const periodSales = currentDays
          .filter((d: any) => d.business_date >= period.startDate && d.business_date <= effectiveEnd)
          .reduce((sum: number, d: any) => sum + (d.net_sales || 0), 0);
        const periodCovers = currentDays
          .filter((d: any) => d.business_date >= period.startDate && d.business_date <= effectiveEnd)
          .reduce((sum: number, d: any) => sum + (d.covers_count || 0), 0);

        // Prior year same period
        let priorSales: number | null = null;
        let priorCovers: number | null = null;
        if (i < lyAllPeriods.length) {
          const lyPeriod = lyAllPeriods[i];
          // For current (incomplete) period, only compare equivalent days
          const lyEffectiveEnd = period.endDate > date
            ? (() => {
                const daysIntoPd = Math.floor((new Date(effectiveEnd).getTime() - new Date(period.startDate).getTime()) / 86400000);
                const lyEnd = new Date(lyPeriod.startDate);
                lyEnd.setDate(lyEnd.getDate() + daysIntoPd);
                return lyEnd.toISOString().split('T')[0];
              })()
            : lyPeriod.endDate;

          priorSales = priorDays
            .filter((d: any) => d.business_date >= lyPeriod.startDate && d.business_date <= lyEffectiveEnd)
            .reduce((sum: number, d: any) => sum + (d.net_sales || 0), 0);
          priorCovers = priorDays
            .filter((d: any) => d.business_date >= lyPeriod.startDate && d.business_date <= lyEffectiveEnd)
            .reduce((sum: number, d: any) => sum + (d.covers_count || 0), 0);
        }

        ytdPeriods.push({
          period: period.period,
          label: `P${period.period}`,
          start_date: period.startDate,
          end_date: effectiveEnd,
          net_sales: periodSales,
          covers: periodCovers,
          prior_net_sales: priorSales,
          prior_covers: priorCovers,
        });
      }
    }

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
        ptd_net_sales: ptdCurrent.net_sales,
        ptd_covers: ptdCurrent.covers,
        ptd_lw_net_sales: ptdLastWeek.net_sales,
        ptd_lw_covers: ptdLastWeek.covers,
        vs_ptd_pct: calcVariance(ptdCurrent.net_sales, ptdLastWeek.net_sales),
        vs_ptd_covers_pct: calcVariance(ptdCurrent.covers, ptdLastWeek.covers),
        // WTD (Week-to-Date): calendar week Monday → selected date vs same days last week
        wtd_net_sales: wtdThisWeek.net_sales,
        wtd_covers: wtdThisWeek.covers,
        wtd_lw_net_sales: wtdLastWeek.net_sales,
        wtd_lw_covers: wtdLastWeek.covers,
        vs_wtd_pct: calcVariance(wtdThisWeek.net_sales, wtdLastWeek.net_sales),
        vs_wtd_covers_pct: calcVariance(wtdThisWeek.covers, wtdLastWeek.covers),
        // SWLY (Same Week Last Year)
        wtd_swly_net_sales: swlyTotals.net_sales,
        wtd_swly_covers: swlyTotals.covers,
        vs_wtd_swly_pct: calcVariance(wtdThisWeek.net_sales, swlyTotals.net_sales),
        vs_wtd_swly_covers_pct: calcVariance(wtdThisWeek.covers, swlyTotals.covers),
        // PTD vs Same Period Last Year (SPLY)
        ptd_sply_net_sales: ptdSplyTotals.net_sales,
        ptd_sply_covers: ptdSplyTotals.covers,
        vs_ptd_sply_pct: calcVariance(ptdCurrent.net_sales, ptdSplyTotals.net_sales),
        vs_ptd_sply_covers_pct: calcVariance(ptdCurrent.covers, ptdSplyTotals.covers),
        // YTD (Year-to-Date): FY start → selected date vs same period last year
        ytd_net_sales: ytdThisYear.net_sales,
        ytd_covers: ytdThisYear.covers,
        ytd_ly_net_sales: ytdLastYear.net_sales,
        ytd_ly_covers: ytdLastYear.covers,
        vs_ytd_pct: calcVariance(ytdThisYear.net_sales, ytdLastYear.net_sales),
        vs_ytd_covers_pct: calcVariance(ytdThisYear.covers, ytdLastYear.covers),
        // Debug: date ranges being queried
        _debug: {
          wtd_range: `${weekStartStr} → ${date}`,
          wtd_lw_range: `${lastWeekWeekStartStr} → ${lastWeekSameDayStr}`,
          wtd_swly_range: `${swlyWeekStartStr} → ${swlyWeekEndStr}`,
          ptd_range: `${periodStartStr} → ${date}`,
          ptd_lp_range: `${prevPeriodStartStr} → ${prevPeriodEndStr}`,
          ptd_sply_range: `${ptdSply.startDate} → ${ptdSply.endDate}`,
          ytd_range: `${fyStartStr} → ${date}`,
          ytd_ly_range: `${lyFyStartStr} → ${lyFyEndStr}`,
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

      // Aggregated category breakdown for WTD and PTD
      categories_wtd: categoriesWtd,
      categories_ptd: categoriesPtd,

      // Aggregated menu items for WTD and PTD
      items_wtd: itemsWtd,
      items_ptd: itemsPtd,

      // Aggregated labor metrics for WTD, PTD, and YTD
      labor_wtd: laborWtd,
      labor_ptd: laborPtd,

      // YTD aggregations
      servers_ytd: serversYtd,
      categories_ytd: categoriesYtd,
      items_ytd: itemsYtd,
      labor_ytd: laborYtd,

      // Period breakdowns
      ptd_weeks: ptdWeeks,
      ytd_periods: ytdPeriods,
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
