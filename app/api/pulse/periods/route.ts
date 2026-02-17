/**
 * Pulse Period Aggregation API
 *
 * GET /api/pulse/periods?view=wtd|ptd|ytd&venue_id=xxx&date=YYYY-MM-DD  — single venue
 * GET /api/pulse/periods?view=wtd|ptd|ytd&venue_id=all&date=YYYY-MM-DD  — group-wide
 *
 * Aggregates venue_day_facts + labor_day_facts for the requested period,
 * computes prior-period comparisons, and merges today's live snapshot if needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import {
  getActiveSalesPaceVenues,
  getVenueDayFactsForRange,
  getLaborDayFactsForRange,
  getVenueFiscalConfig,
  getLatestSnapshot,
  VenueDayFact,
  LaborDayFact,
} from '@/lib/database/sales-pace';
import { getServiceClient } from '@/lib/supabase/service';
import { getFiscalPeriod, getFiscalYearStart, getAllPeriodsInFiscalYear, getSamePeriodLastYear } from '@/lib/fiscal-calendar';
import { fetchCompsByReasonForRange, type CompByReason } from '@/lib/database/tipsee';
import type { PtdWeekRow } from '@/components/reports/PeriodWeekBreakdown';
import type { YtdPeriodRow } from '@/components/reports/YtdPeriodBreakdown';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

type PulseViewMode = 'wtd' | 'ptd' | 'ytd';

interface PeriodAggregation {
  net_sales: number;
  gross_sales: number;
  food_sales: number;
  beverage_sales: number;
  comps_total: number;
  voids_total: number;
  checks_count: number;
  covers_count: number;
  days_count: number;
  avg_check: number;
  beverage_pct: number;
}

interface PeriodLaborAggregation {
  labor_cost: number;
  total_hours: number;
  ot_hours: number;
  employee_count: number;
  labor_pct: number;
  splh: number;
  foh_cost: number;
  boh_cost: number;
}

interface PeriodDayRow {
  business_date: string;
  net_sales: number;
  covers_count: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}

interface VarianceSet {
  net_sales_pct: number | null;
  covers_pct: number | null;
  avg_check_pct: number | null;
  labor_pct_delta: number | null;
  comp_pct_delta: number | null;
}

interface VenuePeriodData {
  venue_id: string;
  venue_name: string;
  current: PeriodAggregation;
  prior: PeriodAggregation;
  secondary_prior: PeriodAggregation | null;
  labor_current: PeriodLaborAggregation | null;
  labor_prior: PeriodLaborAggregation | null;
  variance: VarianceSet;
  secondary_variance: VarianceSet | null;
  days: PeriodDayRow[];
  comp_by_reason?: CompByReason[];
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function getTipseeLocationUuids(venueIds: string[]): Promise<Map<string, string[]>> {
  const svc = getServiceClient();
  const { data } = await (svc as any)
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid')
    .in('venue_id', venueIds)
    .eq('is_active', true);

  const map = new Map<string, string[]>();
  for (const row of data || []) {
    if (!row.tipsee_location_uuid) continue;
    const existing = map.get(row.venue_id) || [];
    existing.push(row.tipsee_location_uuid);
    map.set(row.venue_id, existing);
  }
  return map;
}

// ══════════════════════════════════════════════════════════════════════════
// DATE RANGE COMPUTATION
// ══════════════════════════════════════════════════════════════════════════

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

interface DateRanges {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
  priorLabel: string;
  secondaryPriorStart: string | null;
  secondaryPriorEnd: string | null;
  secondaryPriorLabel: string | null;
}

function computeDateRanges(
  view: PulseViewMode,
  anchorDate: string,
  fiscalConfig: { calendarType: any; fyStartDate: string | null }
): DateRanges {
  if (view === 'wtd') {
    const currentStart = getWeekStart(anchorDate);
    const priorStart = shiftDate(currentStart, -7);
    const priorEnd = shiftDate(anchorDate, -7);

    // Secondary: Same Week Last Year (52 weeks back = 364 days)
    const secStart = shiftDate(currentStart, -364);
    const secEnd = shiftDate(anchorDate, -364);

    return {
      currentStart, currentEnd: anchorDate, priorStart, priorEnd,
      priorLabel: 'vs LW',
      secondaryPriorStart: secStart, secondaryPriorEnd: secEnd,
      secondaryPriorLabel: 'vs SWLY',
    };
  }

  if (view === 'ptd') {
    const fiscalPeriod = getFiscalPeriod(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);
    const currentStart = fiscalPeriod.periodStartDate;

    // Days into current period
    const startParts = currentStart.split('-').map(Number);
    const anchorParts = anchorDate.split('-').map(Number);
    const periodStartDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    const anchorDateObj = new Date(anchorParts[0], anchorParts[1] - 1, anchorParts[2]);
    const daysIntoPeriod = Math.floor((anchorDateObj.getTime() - periodStartDate.getTime()) / (24 * 60 * 60 * 1000));

    // Primary: Previous period (vs LP)
    const prevPeriodLastDay = shiftDate(currentStart, -1);
    const prevPeriodInfo = getFiscalPeriod(prevPeriodLastDay, fiscalConfig.calendarType, fiscalConfig.fyStartDate);
    const priorStart = prevPeriodInfo.periodStartDate;
    const priorEnd = shiftDate(priorStart, daysIntoPeriod);

    // Secondary: Same Period Last Year (vs SPLY)
    const sply = getSamePeriodLastYear(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);

    return {
      currentStart, currentEnd: anchorDate, priorStart, priorEnd,
      priorLabel: 'vs LP',
      secondaryPriorStart: sply.startDate, secondaryPriorEnd: sply.endDate,
      secondaryPriorLabel: 'vs SPLY',
    };
  }

  // YTD — use getFiscalYearStart to find the correct FY start
  const currentStart = getFiscalYearStart(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);

  // Prior YTD: find LY fiscal year start, then same number of days into that year
  const currentStartParts = currentStart.split('-').map(Number);
  const currentStartDate = new Date(currentStartParts[0], currentStartParts[1] - 1, currentStartParts[2]);
  const lyFyStart = new Date(currentStartDate);
  lyFyStart.setFullYear(lyFyStart.getFullYear() - 1);
  const priorStart = lyFyStart.toISOString().split('T')[0];

  // Same number of days into the prior fiscal year
  const anchorParts = anchorDate.split('-').map(Number);
  const anchorDateObj = new Date(anchorParts[0], anchorParts[1] - 1, anchorParts[2]);
  const daysIntoFY = Math.floor((anchorDateObj.getTime() - currentStartDate.getTime()) / (24 * 60 * 60 * 1000));
  const priorEndDate = new Date(lyFyStart);
  priorEndDate.setDate(priorEndDate.getDate() + daysIntoFY);
  const priorEnd = priorEndDate.toISOString().split('T')[0];

  return {
    currentStart,
    currentEnd: anchorDate,
    priorStart,
    priorEnd,
    priorLabel: 'vs LY',
    secondaryPriorStart: null,
    secondaryPriorEnd: null,
    secondaryPriorLabel: null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// AGGREGATION
// ══════════════════════════════════════════════════════════════════════════

function aggregateFacts(rows: VenueDayFact[]): PeriodAggregation {
  const totals = rows.reduce(
    (acc, row) => ({
      net_sales: acc.net_sales + row.net_sales,
      gross_sales: acc.gross_sales + row.gross_sales,
      food_sales: acc.food_sales + row.food_sales,
      beverage_sales: acc.beverage_sales + row.beverage_sales,
      comps_total: acc.comps_total + row.comps_total,
      voids_total: acc.voids_total + row.voids_total,
      checks_count: acc.checks_count + row.checks_count,
      covers_count: acc.covers_count + row.covers_count,
    }),
    { net_sales: 0, gross_sales: 0, food_sales: 0, beverage_sales: 0, comps_total: 0, voids_total: 0, checks_count: 0, covers_count: 0 }
  );

  const totalFoodBev = totals.food_sales + totals.beverage_sales;

  return {
    ...totals,
    days_count: rows.length,
    avg_check: totals.checks_count > 0 ? totals.gross_sales / totals.checks_count : 0,
    beverage_pct: totalFoodBev > 0 ? (totals.beverage_sales / totalFoodBev) * 100 : 0,
  };
}

function aggregateLabor(rows: LaborDayFact[], netSales: number): PeriodLaborAggregation | null {
  if (rows.length === 0) return null;

  const totals = rows.reduce(
    (acc, row) => ({
      labor_cost: acc.labor_cost + row.labor_cost,
      total_hours: acc.total_hours + row.total_hours,
      ot_hours: acc.ot_hours + row.ot_hours,
      employee_count: Math.max(acc.employee_count, row.employee_count),
      foh_cost: acc.foh_cost + row.foh_cost,
      boh_cost: acc.boh_cost + row.boh_cost,
    }),
    { labor_cost: 0, total_hours: 0, ot_hours: 0, employee_count: 0, foh_cost: 0, boh_cost: 0 }
  );

  return {
    ...totals,
    labor_pct: netSales > 0 ? (totals.labor_cost / netSales) * 100 : 0,
    splh: totals.total_hours > 0 ? netSales / totals.total_hours : 0,
  };
}

function computeVariance(
  current: PeriodAggregation,
  prior: PeriodAggregation,
  laborCurrent: PeriodLaborAggregation | null,
  laborPrior: PeriodLaborAggregation | null
) {
  const pct = (curr: number, prev: number) =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null;

  const currentCompPct = current.net_sales > 0 ? (current.comps_total / current.net_sales) * 100 : 0;
  const priorCompPct = prior.net_sales > 0 ? (prior.comps_total / prior.net_sales) * 100 : 0;

  return {
    net_sales_pct: pct(current.net_sales, prior.net_sales),
    covers_pct: pct(current.covers_count, prior.covers_count),
    avg_check_pct: pct(current.avg_check, prior.avg_check),
    labor_pct_delta: laborCurrent && laborPrior ? laborCurrent.labor_pct - laborPrior.labor_pct : null,
    comp_pct_delta: prior.days_count > 0 ? currentCompPct - priorCompPct : null,
  };
}

function buildDaysArray(
  currentRows: VenueDayFact[],
  priorRows: VenueDayFact[],
  currentStart: string,
  priorStart: string
): PeriodDayRow[] {
  // Build a map of prior period by day offset
  const priorStartParts = priorStart.split('-').map(Number);
  const priorStartDate = new Date(priorStartParts[0], priorStartParts[1] - 1, priorStartParts[2]);
  const priorByOffset = new Map<number, VenueDayFact>();
  for (const row of priorRows) {
    const rowParts = row.business_date.split('-').map(Number);
    const rowDate = new Date(rowParts[0], rowParts[1] - 1, rowParts[2]);
    const offset = Math.floor((rowDate.getTime() - priorStartDate.getTime()) / (24 * 60 * 60 * 1000));
    priorByOffset.set(offset, row);
  }

  const currentStartParts = currentStart.split('-').map(Number);
  const currentStartDate = new Date(currentStartParts[0], currentStartParts[1] - 1, currentStartParts[2]);

  return currentRows.map((row) => {
    const rowParts = row.business_date.split('-').map(Number);
    const rowDate = new Date(rowParts[0], rowParts[1] - 1, rowParts[2]);
    const offset = Math.floor((rowDate.getTime() - currentStartDate.getTime()) / (24 * 60 * 60 * 1000));
    const priorRow = priorByOffset.get(offset);

    return {
      business_date: row.business_date,
      net_sales: row.net_sales,
      covers_count: row.covers_count,
      prior_net_sales: priorRow?.net_sales ?? null,
      prior_covers: priorRow?.covers_count ?? null,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════
// BREAKDOWNS
// ══════════════════════════════════════════════════════════════════════════

function buildWeekBreakdown(days: PeriodDayRow[], periodStart: string): PtdWeekRow[] {
  const psParts = periodStart.split('-').map(Number);
  const psDate = new Date(psParts[0], psParts[1] - 1, psParts[2]);
  const weeks = new Map<number, PtdWeekRow>();

  for (const d of days) {
    const dParts = d.business_date.split('-').map(Number);
    const dDate = new Date(dParts[0], dParts[1] - 1, dParts[2]);
    const dayOffset = Math.floor((dDate.getTime() - psDate.getTime()) / (24 * 60 * 60 * 1000));
    const weekNum = Math.floor(dayOffset / 7) + 1;

    if (!weeks.has(weekNum)) {
      const wStart = new Date(psDate);
      wStart.setDate(wStart.getDate() + (weekNum - 1) * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      weeks.set(weekNum, {
        week: weekNum,
        label: `W${weekNum}`,
        start_date: wStart.toISOString().split('T')[0],
        end_date: wEnd.toISOString().split('T')[0],
        net_sales: 0,
        covers: 0,
        prior_net_sales: null,
        prior_covers: null,
      });
    }

    const w = weeks.get(weekNum)!;
    w.net_sales += d.net_sales;
    w.covers += d.covers_count;
    if (d.prior_net_sales != null) {
      w.prior_net_sales = (w.prior_net_sales || 0) + d.prior_net_sales;
    }
    if (d.prior_covers != null) {
      w.prior_covers = (w.prior_covers || 0) + d.prior_covers;
    }
  }

  return Array.from(weeks.values()).sort((a, b) => a.week - b.week);
}

function buildPeriodBreakdown(
  days: PeriodDayRow[],
  fyStart: string,
  calendarType: Parameters<typeof getAllPeriodsInFiscalYear>[1]
): YtdPeriodRow[] {
  const allPeriods = getAllPeriodsInFiscalYear(fyStart, calendarType);
  const result: YtdPeriodRow[] = [];

  for (const p of allPeriods) {
    const pStart = p.startDate;
    const pEnd = p.endDate;

    // Filter days that fall within this period
    const periodDays = days.filter(d => d.business_date >= pStart && d.business_date <= pEnd);
    if (periodDays.length === 0) continue;

    const netSales = periodDays.reduce((s, d) => s + d.net_sales, 0);
    const covers = periodDays.reduce((s, d) => s + d.covers_count, 0);
    const priorSales = periodDays.reduce((s, d) => s + (d.prior_net_sales || 0), 0);
    const priorCovers = periodDays.reduce((s, d) => s + (d.prior_covers || 0), 0);

    result.push({
      period: p.period,
      label: `P${p.period}`,
      start_date: pStart,
      end_date: pEnd,
      net_sales: netSales,
      covers,
      prior_net_sales: priorSales > 0 ? priorSales : null,
      prior_covers: priorCovers > 0 ? priorCovers : null,
    });
  }

  return result;
}

function mergeDaysAcrossVenues(venues: VenuePeriodData[]): PeriodDayRow[] {
  const dayMap = new Map<string, PeriodDayRow>();
  for (const v of venues) {
    for (const d of v.days) {
      const existing = dayMap.get(d.business_date);
      if (existing) {
        existing.net_sales += d.net_sales;
        existing.covers_count += d.covers_count;
        existing.prior_net_sales = (existing.prior_net_sales || 0) + (d.prior_net_sales || 0);
        existing.prior_covers = (existing.prior_covers || 0) + (d.prior_covers || 0);
      } else {
        dayMap.set(d.business_date, { ...d });
      }
    }
  }
  return Array.from(dayMap.values()).sort((a, b) => a.business_date.localeCompare(b.business_date));
}

// ══════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ══════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const userId = user?.id || cookieStore.get('user_id')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const view = request.nextUrl.searchParams.get('view') as PulseViewMode | null;
  const venueId = request.nextUrl.searchParams.get('venue_id');
  const date = request.nextUrl.searchParams.get('date');

  if (!view || !['wtd', 'ptd', 'ytd'].includes(view)) {
    return NextResponse.json({ error: 'view must be wtd, ptd, or ytd' }, { status: 400 });
  }
  if (!venueId || !date) {
    return NextResponse.json({ error: 'venue_id and date are required' }, { status: 400 });
  }

  try {
    if (venueId === 'all') {
      return handleGroup(view, date);
    }
    return handleSingleVenue(view, venueId, date);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Period aggregation failed';
    console.error('Pulse periods error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleSingleVenue(view: PulseViewMode, venueId: string, anchorDate: string) {
  const svc = getServiceClient();

  // Get venue name + fiscal config in parallel
  const [venueResult, fiscalConfig] = await Promise.all([
    (svc as any).from('venues').select('name').eq('id', venueId).single(),
    getVenueFiscalConfig(venueId),
  ]);
  const venueName = venueResult.data?.name || venueId;

  const ranges = computeDateRanges(view, anchorDate, fiscalConfig);
  const fiscalPeriod = getFiscalPeriod(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);

  // Fetch all data in parallel (including secondary prior if applicable)
  const fetchPromises: Promise<VenueDayFact[]>[] = [
    getVenueDayFactsForRange([venueId], ranges.currentStart, ranges.currentEnd),
    getVenueDayFactsForRange([venueId], ranges.priorStart, ranges.priorEnd),
    getLaborDayFactsForRange([venueId], ranges.currentStart, ranges.currentEnd) as any,
    getLaborDayFactsForRange([venueId], ranges.priorStart, ranges.priorEnd) as any,
  ];
  if (ranges.secondaryPriorStart && ranges.secondaryPriorEnd) {
    fetchPromises.push(getVenueDayFactsForRange([venueId], ranges.secondaryPriorStart, ranges.secondaryPriorEnd));
  }

  const results = await Promise.all(fetchPromises);
  const currentFacts = results[0];
  const priorFacts = results[1];
  const currentLabor = results[2] as unknown as LaborDayFact[];
  const priorLabor = results[3] as unknown as LaborDayFact[];
  const secondaryPriorFacts = results[4] || null;

  // Check if today is in the current period — merge live snapshot if so
  const today = new Date().toISOString().split('T')[0];
  const todayInPeriod = today >= ranges.currentStart && today <= ranges.currentEnd;
  const hasTodayFact = currentFacts.some(f => f.business_date === today);

  if (todayInPeriod && !hasTodayFact) {
    const snapshot = await getLatestSnapshot(venueId, today);
    if (snapshot && snapshot.net_sales > 0) {
      currentFacts.push({
        venue_id: venueId,
        business_date: today,
        gross_sales: snapshot.gross_sales,
        net_sales: snapshot.net_sales,
        food_sales: snapshot.food_sales,
        beverage_sales: snapshot.beverage_sales,
        comps_total: snapshot.comps_total,
        voids_total: snapshot.voids_total,
        checks_count: snapshot.checks_count,
        covers_count: snapshot.covers_count,
      });
      // Also add labor from snapshot
      if (snapshot.labor_cost > 0 || snapshot.labor_hours > 0) {
        currentLabor.push({
          venue_id: venueId,
          business_date: today,
          total_hours: snapshot.labor_hours,
          labor_cost: snapshot.labor_cost,
          ot_hours: snapshot.labor_ot_hours,
          employee_count: snapshot.labor_employee_count,
          foh_cost: snapshot.labor_foh_cost,
          boh_cost: snapshot.labor_boh_cost,
        });
      }
    }
  }

  const current = aggregateFacts(currentFacts);
  const prior = aggregateFacts(priorFacts);
  const laborCurrent = aggregateLabor(currentLabor, current.net_sales);
  const laborPrior = aggregateLabor(priorLabor, prior.net_sales);
  const variance = computeVariance(current, prior, laborCurrent, laborPrior);
  const days = buildDaysArray(currentFacts, priorFacts, ranges.currentStart, ranges.priorStart);

  // Secondary prior
  const secondaryPrior = secondaryPriorFacts ? aggregateFacts(secondaryPriorFacts) : null;
  const secondaryVariance = secondaryPrior ? computeVariance(current, secondaryPrior, null, null) : null;

  // Fetch comp reasons from TipSee for current period
  const locationMap = await getTipseeLocationUuids([venueId]);
  const locationUuids = locationMap.get(venueId) || [];
  const compByReason = locationUuids.length > 0
    ? await fetchCompsByReasonForRange(locationUuids, ranges.currentStart, ranges.currentEnd)
    : [];

  const venueData: VenuePeriodData = {
    venue_id: venueId,
    venue_name: venueName,
    current,
    prior,
    secondary_prior: secondaryPrior,
    labor_current: laborCurrent,
    labor_prior: laborPrior,
    variance,
    secondary_variance: secondaryVariance,
    days,
    comp_by_reason: compByReason,
  };

  // Build breakdowns
  const ptd_weeks = view === 'ptd' ? buildWeekBreakdown(days, ranges.currentStart) : undefined;
  const ytd_periods = view === 'ytd' ? buildPeriodBreakdown(days, ranges.currentStart, fiscalConfig.calendarType) : undefined;

  console.log(`[pulse/periods] ${view} venue=${venueId} date=${anchorDate} range=${ranges.currentStart}→${ranges.currentEnd} prior=${ranges.priorStart}→${ranges.priorEnd} sec=${ranges.secondaryPriorStart ?? 'none'}→${ranges.secondaryPriorEnd ?? 'none'} currentFacts=${currentFacts.length} priorFacts=${priorFacts.length} secFacts=${secondaryPriorFacts?.length ?? 0} compReasons=${compByReason.length} days=${days.length} ptd_weeks=${ptd_weeks?.length ?? '-'} ytd_periods=${ytd_periods?.length ?? '-'} fiscal=${fiscalConfig.calendarType}`);

  return NextResponse.json({
    view,
    date: anchorDate,
    period_start: ranges.currentStart,
    period_end: ranges.currentEnd,
    prior_start: ranges.priorStart,
    prior_end: ranges.priorEnd,
    prior_label: ranges.priorLabel,
    secondary_prior_start: ranges.secondaryPriorStart,
    secondary_prior_end: ranges.secondaryPriorEnd,
    secondary_prior_label: ranges.secondaryPriorLabel,
    venue: venueData,
    ...(ptd_weeks && { ptd_weeks }),
    ...(ytd_periods && { ytd_periods }),
    fiscal: {
      calendar_type: fiscalConfig.calendarType,
      fiscal_year: fiscalPeriod.fiscalYear,
      fiscal_period: fiscalPeriod.fiscalPeriod,
      period_start_date: fiscalPeriod.periodStartDate,
      period_end_date: fiscalPeriod.periodEndDate,
    },
  });
}

async function handleGroup(view: PulseViewMode, anchorDate: string) {
  const activeVenues = await getActiveSalesPaceVenues();
  if (activeVenues.length === 0) {
    return NextResponse.json({ venues: [], totals: null });
  }

  const svc = getServiceClient();
  const venueIds = activeVenues.map(v => v.venue_id);

  // Use first venue's fiscal config (all venues share org)
  const [venueResult, fiscalConfig] = await Promise.all([
    (svc as any).from('venues').select('id, name').in('id', venueIds),
    getVenueFiscalConfig(venueIds[0]),
  ]);

  const nameMap = new Map<string, string>(
    (venueResult.data || []).map((v: { id: string; name: string }) => [v.id, v.name])
  );

  const ranges = computeDateRanges(view, anchorDate, fiscalConfig);
  const fiscalPeriod = getFiscalPeriod(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);

  // Single batch query for all venues (including secondary prior if applicable)
  const groupFetchPromises: Promise<any[]>[] = [
    getVenueDayFactsForRange(venueIds, ranges.currentStart, ranges.currentEnd),
    getVenueDayFactsForRange(venueIds, ranges.priorStart, ranges.priorEnd),
    getLaborDayFactsForRange(venueIds, ranges.currentStart, ranges.currentEnd),
    getLaborDayFactsForRange(venueIds, ranges.priorStart, ranges.priorEnd),
  ];
  if (ranges.secondaryPriorStart && ranges.secondaryPriorEnd) {
    groupFetchPromises.push(getVenueDayFactsForRange(venueIds, ranges.secondaryPriorStart, ranges.secondaryPriorEnd));
  }

  const groupResults = await Promise.all(groupFetchPromises);
  const allCurrentFacts: VenueDayFact[] = groupResults[0];
  const allPriorFacts: VenueDayFact[] = groupResults[1];
  const allCurrentLabor: LaborDayFact[] = groupResults[2];
  const allPriorLabor: LaborDayFact[] = groupResults[3];
  const allSecondaryPriorFacts: VenueDayFact[] | null = groupResults[4] || null;

  // Check if today's live data should be merged
  const today = new Date().toISOString().split('T')[0];
  const todayInPeriod = today >= ranges.currentStart && today <= ranges.currentEnd;

  if (todayInPeriod) {
    const snapshotResults = await Promise.allSettled(
      venueIds.map(vid => getLatestSnapshot(vid, today))
    );

    for (let i = 0; i < venueIds.length; i++) {
      const result = snapshotResults[i];
      if (result.status !== 'fulfilled' || !result.value || result.value.net_sales <= 0) continue;

      const vid = venueIds[i];
      const hasTodayFact = allCurrentFacts.some(f => f.venue_id === vid && f.business_date === today);
      if (hasTodayFact) continue;

      const snapshot = result.value;
      allCurrentFacts.push({
        venue_id: vid,
        business_date: today,
        gross_sales: snapshot.gross_sales,
        net_sales: snapshot.net_sales,
        food_sales: snapshot.food_sales,
        beverage_sales: snapshot.beverage_sales,
        comps_total: snapshot.comps_total,
        voids_total: snapshot.voids_total,
        checks_count: snapshot.checks_count,
        covers_count: snapshot.covers_count,
      });

      if (snapshot.labor_cost > 0 || snapshot.labor_hours > 0) {
        allCurrentLabor.push({
          venue_id: vid,
          business_date: today,
          total_hours: snapshot.labor_hours,
          labor_cost: snapshot.labor_cost,
          ot_hours: snapshot.labor_ot_hours,
          employee_count: snapshot.labor_employee_count,
          foh_cost: snapshot.labor_foh_cost,
          boh_cost: snapshot.labor_boh_cost,
        });
      }
    }
  }

  // Fetch comp reasons from TipSee for all venues in one batch
  const locationMap = await getTipseeLocationUuids(venueIds);
  const allLocationUuids = Array.from(locationMap.values()).flat();
  const allCompsByReason = allLocationUuids.length > 0
    ? await fetchCompsByReasonForRange(allLocationUuids, ranges.currentStart, ranges.currentEnd)
    : [];

  // Build a per-venue comp reason lookup: we need per-venue location UUIDs to filter
  // Since fetchCompsByReasonForRange returns aggregated results, we need per-venue queries
  // For efficiency, do parallel per-venue comp queries
  const venueCompReasons = await Promise.all(
    venueIds.map(vid => {
      const uuids = locationMap.get(vid) || [];
      return uuids.length > 0
        ? fetchCompsByReasonForRange(uuids, ranges.currentStart, ranges.currentEnd)
        : Promise.resolve([]);
    })
  );

  // Aggregate per venue
  const venues: VenuePeriodData[] = venueIds.map((vid, idx) => {
    const currentFacts = allCurrentFacts.filter(f => f.venue_id === vid);
    const priorFacts = allPriorFacts.filter(f => f.venue_id === vid);
    const currentLabor = allCurrentLabor.filter(f => f.venue_id === vid);
    const priorLabor = allPriorLabor.filter(f => f.venue_id === vid);

    const current = aggregateFacts(currentFacts);
    const prior = aggregateFacts(priorFacts);
    const laborCurrent = aggregateLabor(currentLabor, current.net_sales);
    const laborPrior = aggregateLabor(priorLabor, prior.net_sales);
    const variance = computeVariance(current, prior, laborCurrent, laborPrior);
    const days = buildDaysArray(currentFacts, priorFacts, ranges.currentStart, ranges.priorStart);

    // Secondary prior
    const secFacts = allSecondaryPriorFacts?.filter(f => f.venue_id === vid) || null;
    const secPrior = secFacts && secFacts.length > 0 ? aggregateFacts(secFacts) : null;
    const secVariance = secPrior ? computeVariance(current, secPrior, null, null) : null;

    return {
      venue_id: vid,
      venue_name: nameMap.get(vid) || vid,
      current,
      prior,
      secondary_prior: secPrior,
      labor_current: laborCurrent,
      labor_prior: laborPrior,
      variance,
      secondary_variance: secVariance,
      days,
      comp_by_reason: venueCompReasons[idx],
    };
  });

  // Group totals
  const groupCurrentFacts = aggregateFacts(allCurrentFacts);
  const groupPriorFacts = aggregateFacts(allPriorFacts);
  const groupLaborCurrent = aggregateLabor(allCurrentLabor, groupCurrentFacts.net_sales);
  const groupLaborPrior = aggregateLabor(allPriorLabor, groupPriorFacts.net_sales);
  const groupVariance = computeVariance(groupCurrentFacts, groupPriorFacts, groupLaborCurrent, groupLaborPrior);

  // Group secondary prior
  const groupSecondaryPrior = allSecondaryPriorFacts && allSecondaryPriorFacts.length > 0
    ? aggregateFacts(allSecondaryPriorFacts) : null;
  const groupSecondaryVariance = groupSecondaryPrior
    ? computeVariance(groupCurrentFacts, groupSecondaryPrior, null, null) : null;

  // Aggregate comp reasons across all venues
  const reasonMap = new Map<string, { count: number; total: number }>();
  for (const v of venues) {
    for (const r of v.comp_by_reason || []) {
      const existing = reasonMap.get(r.reason) || { count: 0, total: 0 };
      existing.count += r.count;
      existing.total += r.total;
      reasonMap.set(r.reason, existing);
    }
  }
  const groupCompByReason: CompByReason[] = [...reasonMap.entries()]
    .map(([reason, { count, total }]) => ({ reason, count, total }))
    .sort((a, b) => b.total - a.total);

  // Build group-level breakdowns by merging all venue days
  let ptd_weeks: PtdWeekRow[] | undefined;
  let ytd_periods: YtdPeriodRow[] | undefined;
  if (view === 'ptd' || view === 'ytd') {
    const mergedDays = mergeDaysAcrossVenues(venues);
    if (view === 'ptd') {
      ptd_weeks = buildWeekBreakdown(mergedDays, ranges.currentStart);
    } else {
      ytd_periods = buildPeriodBreakdown(mergedDays, ranges.currentStart, fiscalConfig.calendarType);
    }
  }

  const totalDays = venues.reduce((s, v) => s + v.days.length, 0);
  console.log(`[pulse/periods] ${view} group venues=${venues.length} range=${ranges.currentStart}→${ranges.currentEnd} prior=${ranges.priorStart}→${ranges.priorEnd} sec=${ranges.secondaryPriorStart ?? 'none'}→${ranges.secondaryPriorEnd ?? 'none'} currentFacts=${allCurrentFacts.length} secFacts=${allSecondaryPriorFacts?.length ?? 0} totalDays=${totalDays} ptd_weeks=${ptd_weeks?.length ?? '-'} ytd_periods=${ytd_periods?.length ?? '-'} fiscal=${fiscalConfig.calendarType}`);

  return NextResponse.json({
    view,
    date: anchorDate,
    period_start: ranges.currentStart,
    period_end: ranges.currentEnd,
    prior_start: ranges.priorStart,
    prior_end: ranges.priorEnd,
    prior_label: ranges.priorLabel,
    secondary_prior_start: ranges.secondaryPriorStart,
    secondary_prior_end: ranges.secondaryPriorEnd,
    secondary_prior_label: ranges.secondaryPriorLabel,
    venues,
    totals: {
      current: groupCurrentFacts,
      prior: groupPriorFacts,
      secondary_prior: groupSecondaryPrior,
      labor_current: groupLaborCurrent,
      labor_prior: groupLaborPrior,
      variance: groupVariance,
      secondary_variance: groupSecondaryVariance,
      comp_by_reason: groupCompByReason,
    },
    ...(ptd_weeks && { ptd_weeks }),
    ...(ytd_periods && { ytd_periods }),
    fiscal: {
      calendar_type: fiscalConfig.calendarType,
      fiscal_year: fiscalPeriod.fiscalYear,
      fiscal_period: fiscalPeriod.fiscalPeriod,
      period_start_date: fiscalPeriod.periodStartDate,
      period_end_date: fiscalPeriod.periodEndDate,
    },
  });
}
