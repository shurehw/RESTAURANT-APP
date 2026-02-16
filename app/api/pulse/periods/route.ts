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
import { getFiscalPeriod, getSamePeriodLastYear } from '@/lib/fiscal-calendar';

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

interface VenuePeriodData {
  venue_id: string;
  venue_name: string;
  current: PeriodAggregation;
  prior: PeriodAggregation;
  labor_current: PeriodLaborAggregation | null;
  labor_prior: PeriodLaborAggregation | null;
  variance: {
    net_sales_pct: number | null;
    covers_pct: number | null;
    avg_check_pct: number | null;
    labor_pct_delta: number | null;
    comp_pct_delta: number | null;
  };
  days: PeriodDayRow[];
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

function computeDateRanges(
  view: PulseViewMode,
  anchorDate: string,
  fiscalConfig: { calendarType: any; fyStartDate: string | null }
): {
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
} {
  if (view === 'wtd') {
    const currentStart = getWeekStart(anchorDate);
    const priorStart = shiftDate(currentStart, -7);
    const priorEnd = shiftDate(anchorDate, -7);
    return { currentStart, currentEnd: anchorDate, priorStart, priorEnd };
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

    // Previous period
    const prevPeriodLastDay = shiftDate(currentStart, -1);
    const prevPeriodInfo = getFiscalPeriod(prevPeriodLastDay, fiscalConfig.calendarType, fiscalConfig.fyStartDate);
    const priorStart = prevPeriodInfo.periodStartDate;
    const priorEnd = shiftDate(priorStart, daysIntoPeriod);

    return { currentStart, currentEnd: anchorDate, priorStart, priorEnd };
  }

  // YTD
  const fiscalPeriod = getFiscalPeriod(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);

  // For standard calendar, year starts Jan 1
  let currentStart: string;
  if (fiscalConfig.calendarType === 'standard' || !fiscalConfig.fyStartDate) {
    const anchorParts = anchorDate.split('-').map(Number);
    currentStart = `${anchorParts[0]}-01-01`;
  } else {
    // Find FY start that applies to this date
    let fyStart = new Date(fiscalConfig.fyStartDate);
    const anchorParts = anchorDate.split('-').map(Number);
    const anchorDateObj = new Date(anchorParts[0], anchorParts[1] - 1, anchorParts[2]);
    while (anchorDateObj < fyStart) {
      fyStart.setFullYear(fyStart.getFullYear() - 1);
    }
    const nextYearStart = new Date(fyStart);
    nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
    while (anchorDateObj >= nextYearStart) {
      fyStart.setFullYear(fyStart.getFullYear() + 1);
      nextYearStart.setFullYear(nextYearStart.getFullYear() + 1);
    }
    currentStart = fyStart.toISOString().split('T')[0];
  }

  const prior = getSamePeriodLastYear(anchorDate, fiscalConfig.calendarType, fiscalConfig.fyStartDate);

  return {
    currentStart,
    currentEnd: anchorDate,
    priorStart: prior.startDate,
    priorEnd: prior.endDate,
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

  // Fetch all data in parallel
  const [currentFacts, priorFacts, currentLabor, priorLabor] = await Promise.all([
    getVenueDayFactsForRange([venueId], ranges.currentStart, ranges.currentEnd),
    getVenueDayFactsForRange([venueId], ranges.priorStart, ranges.priorEnd),
    getLaborDayFactsForRange([venueId], ranges.currentStart, ranges.currentEnd),
    getLaborDayFactsForRange([venueId], ranges.priorStart, ranges.priorEnd),
  ]);

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

  const venueData: VenuePeriodData = {
    venue_id: venueId,
    venue_name: venueName,
    current,
    prior,
    labor_current: laborCurrent,
    labor_prior: laborPrior,
    variance,
    days,
  };

  return NextResponse.json({
    view,
    date: anchorDate,
    period_start: ranges.currentStart,
    period_end: ranges.currentEnd,
    prior_start: ranges.priorStart,
    prior_end: ranges.priorEnd,
    venue: venueData,
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

  // Single batch query for all venues
  const [allCurrentFacts, allPriorFacts, allCurrentLabor, allPriorLabor] = await Promise.all([
    getVenueDayFactsForRange(venueIds, ranges.currentStart, ranges.currentEnd),
    getVenueDayFactsForRange(venueIds, ranges.priorStart, ranges.priorEnd),
    getLaborDayFactsForRange(venueIds, ranges.currentStart, ranges.currentEnd),
    getLaborDayFactsForRange(venueIds, ranges.priorStart, ranges.priorEnd),
  ]);

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

  // Aggregate per venue
  const venues: VenuePeriodData[] = venueIds.map(vid => {
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

    return {
      venue_id: vid,
      venue_name: nameMap.get(vid) || vid,
      current,
      prior,
      labor_current: laborCurrent,
      labor_prior: laborPrior,
      variance,
      days,
    };
  });

  // Group totals
  const groupCurrentFacts = aggregateFacts(allCurrentFacts);
  const groupPriorFacts = aggregateFacts(allPriorFacts);
  const groupLaborCurrent = aggregateLabor(allCurrentLabor, groupCurrentFacts.net_sales);
  const groupLaborPrior = aggregateLabor(allPriorLabor, groupPriorFacts.net_sales);
  const groupVariance = computeVariance(groupCurrentFacts, groupPriorFacts, groupLaborCurrent, groupLaborPrior);

  return NextResponse.json({
    view,
    date: anchorDate,
    period_start: ranges.currentStart,
    period_end: ranges.currentEnd,
    prior_start: ranges.priorStart,
    prior_end: ranges.priorEnd,
    venues,
    totals: {
      current: groupCurrentFacts,
      prior: groupPriorFacts,
      labor_current: groupLaborCurrent,
      labor_prior: groupLaborPrior,
      variance: groupVariance,
    },
    fiscal: {
      calendar_type: fiscalConfig.calendarType,
      fiscal_year: fiscalPeriod.fiscalYear,
      fiscal_period: fiscalPeriod.fiscalPeriod,
      period_start_date: fiscalPeriod.periodStartDate,
      period_end_date: fiscalPeriod.periodEndDate,
    },
  });
}
