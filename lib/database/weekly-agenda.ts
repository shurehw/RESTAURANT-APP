/**
 * Weekly Agenda Data Access Layer
 *
 * Aggregates 7 days of venue data into a single typed payload
 * for the Weekly Agenda page and AI executive summary.
 *
 * Data sources: venue_day_facts, labor_day_facts, forecasts_with_bias,
 * enforcement_portfolio_rollups, nightly_attestations, comp_resolutions.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getWeeklyGmNotes } from '@/lib/database/weekly-gm-notes';
import type { WeeklyGmNotes } from '@/lib/database/weekly-gm-notes';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface WeeklyAgendaDayRow {
  business_date: string;
  day_of_week: string;
  // Revenue
  net_sales: number;
  gross_sales: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  covers_count: number;
  checks_count: number;
  avg_check: number;
  comps_total: number;
  voids_total: number;
  // Forecast variance
  forecast_revenue: number | null;
  vs_forecast_pct: number | null;
  forecast_covers: number | null;
  vs_forecast_covers_pct: number | null;
  // SDLW variance
  sdlw_net_sales: number | null;
  vs_sdlw_pct: number | null;
  sdlw_covers: number | null;
  vs_sdlw_covers_pct: number | null;
  // Labor
  labor_cost: number;
  labor_pct: number;
  labor_hours: number;
  ot_hours: number;
  employee_count: number;
  foh_cost: number;
  boh_cost: number;
  splh: number;
  cplh: number;
  // Enforcement
  comp_exception_count: number;
  labor_exception_count: number;
  carry_forward_count: number;
  critical_open_count: number;
}

export interface WeeklyAgendaTotals {
  net_sales: number;
  gross_sales: number;
  food_sales: number;
  beverage_sales: number;
  beverage_pct: number;
  covers_count: number;
  checks_count: number;
  avg_check: number;
  comps_total: number;
  comp_pct: number;
  voids_total: number;
  // Forecast
  total_forecast_revenue: number | null;
  vs_forecast_pct: number | null;
  total_forecast_covers: number | null;
  vs_forecast_covers_pct: number | null;
  // SDLW
  total_sdlw_net_sales: number | null;
  vs_sdlw_pct: number | null;
  total_sdlw_covers: number | null;
  vs_sdlw_covers_pct: number | null;
  // Labor
  total_labor_cost: number;
  labor_pct: number;
  total_labor_hours: number;
  total_ot_hours: number;
  avg_splh: number;
  avg_cplh: number;
}

export interface CompResolutionBreakdown {
  resolution_code: string;
  count: number;
  total_amount: number;
  policy_violation_count: number;
  follow_up_required_count: number;
}

export interface EnforcementSummary {
  total_comp_exceptions: number;
  total_labor_exceptions: number;
  total_procurement_exceptions: number;
  total_revenue_variances: number;
  carry_forward_count: number;
  critical_open_count: number;
  escalated_count: number;
  attestation_submitted: number;
  attestation_expected: number;
  attestation_compliance_pct: number;
  comp_resolutions: CompResolutionBreakdown[];
}

export interface LaborInsight {
  revenue_variance_reasons: Array<{ reason: string; count: number }>;
  labor_variance_reasons: Array<{ reason: string; count: number }>;
  labor_tags: Array<{ tag: string; count: number }>;
}

export interface ReviewSummary {
  total_reviews: number;
  negative_reviews: number;
  avg_rating: number | null;
  source_breakdown: Record<string, number>;  // e.g. { GOOGLE: 5, OPEN_TABLE: 3, YELP: 1 }
  top_tags: Array<{ tag: string; count: number }>;
  unresponded_count: number;
  negative_review_texts: Array<{
    source: string;
    rating: number;
    content: string;
    reviewed_at: string;
    thirdparty_url: string | null;
  }>;
}

export interface WeeklyAgendaPayload {
  venue_id: string;
  venue_name: string;
  week_start: string;
  week_end: string;
  days: WeeklyAgendaDayRow[];
  totals: WeeklyAgendaTotals;
  enforcement: EnforcementSummary;
  labor_insights: LaborInsight;
  reviews: ReviewSummary;
  gm_notes: WeeklyGmNotes | null;
  generated_at: string;
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function pf(val: any): number {
  return parseFloat(val ?? '0') || 0;
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return DAYS_OF_WEEK[d.getUTCDay()];
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function pctChange(current: number, baseline: number | null): number | null {
  if (baseline == null || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

/** Generate array of dates from start to end inclusive */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cur = new Date(start + 'T12:00:00Z');
  const last = new Date(end + 'T12:00:00Z');
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN BUILDER
// ══════════════════════════════════════════════════════════════════════════

export async function buildWeeklyAgenda(
  venueId: string,
  weekStart: string,
  weekEnd: string,
  orgId: string,
  venueName: string,
): Promise<WeeklyAgendaPayload> {
  const supabase = getServiceClient();
  const dates = dateRange(weekStart, weekEnd);
  const sdlwDates = dates.map(d => shiftDate(d, -7));

  // Execute all queries in parallel
  const [
    factsResult,
    laborResult,
    forecastResult,
    sdlwResult,
    rollupResult,
    attestationResult,
    compResolutionResult,
    reviewSignalsResult,
    negativeReviewsResult,
    unrespondedResult,
    gmNotes,
  ] = await Promise.all([
    // 1. venue_day_facts for the week
    (supabase as any)
      .from('venue_day_facts')
      .select('*')
      .eq('venue_id', venueId)
      .gte('business_date', weekStart)
      .lte('business_date', weekEnd)
      .order('business_date', { ascending: true }),

    // 2. labor_day_facts for the week
    (supabase as any)
      .from('labor_day_facts')
      .select('*')
      .eq('venue_id', venueId)
      .gte('business_date', weekStart)
      .lte('business_date', weekEnd)
      .order('business_date', { ascending: true }),

    // 3. forecasts for the week
    (supabase as any)
      .from('forecasts_with_bias')
      .select('business_date, revenue_predicted, covers_predicted')
      .eq('venue_id', venueId)
      .gte('business_date', weekStart)
      .lte('business_date', weekEnd),

    // 4. SDLW venue_day_facts (7 days prior for each day)
    (supabase as any)
      .from('venue_day_facts')
      .select('business_date, net_sales, covers_count')
      .eq('venue_id', venueId)
      .in('business_date', sdlwDates),

    // 5. enforcement_portfolio_rollups for venue
    (supabase as any)
      .from('enforcement_portfolio_rollups')
      .select('*')
      .eq('venue_id', venueId)
      .gte('rollup_date', weekStart)
      .lte('rollup_date', weekEnd)
      .order('rollup_date', { ascending: true }),

    // 6. nightly_attestations for insights
    (supabase as any)
      .from('nightly_attestations')
      .select('business_date, revenue_variance_reason, labor_variance_reason, labor_tags, revenue_tags')
      .eq('venue_id', venueId)
      .gte('business_date', weekStart)
      .lte('business_date', weekEnd),

    // 7. comp_resolutions for the week (via attestation join)
    (supabase as any)
      .from('comp_resolutions')
      .select('resolution_code, comp_amount, is_policy_violation, requires_follow_up, nightly_attestations!inner(venue_id, business_date)')
      .eq('nightly_attestations.venue_id', venueId)
      .gte('nightly_attestations.business_date', weekStart)
      .lte('nightly_attestations.business_date', weekEnd),

    // 8. Review daily signals for the week
    (supabase as any)
      .from('venue_review_signals_daily')
      .select('date, review_count, neg_count, avg_rating, source_mix, tag_mix')
      .eq('venue_id', venueId)
      .gte('date', weekStart)
      .lte('date', weekEnd),

    // 9. Negative reviews (rating <= 2) with content for the week
    (supabase as any)
      .from('reviews_raw')
      .select('source, rating, content, reviewed_at, thirdparty_url')
      .eq('venue_id', venueId)
      .gte('reviewed_at', weekStart + 'T00:00:00Z')
      .lte('reviewed_at', weekEnd + 'T23:59:59Z')
      .lte('rating', 2)
      .order('reviewed_at', { ascending: false }),

    // 10. Unresponded reviews count for the week
    (supabase as any)
      .from('reviews_raw')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .eq('has_reply', false)
      .gte('reviewed_at', weekStart + 'T00:00:00Z')
      .lte('reviewed_at', weekEnd + 'T23:59:59Z'),

    // 11. GM notes for the week
    getWeeklyGmNotes(venueId, weekStart),
  ]);

  // Index data by business_date for fast lookup
  const factsMap = new Map<string, any>();
  for (const row of factsResult.data || []) {
    factsMap.set(row.business_date, row);
  }

  const laborMap = new Map<string, any>();
  for (const row of laborResult.data || []) {
    laborMap.set(row.business_date, row);
  }

  const forecastMap = new Map<string, any>();
  for (const row of forecastResult.data || []) {
    forecastMap.set(row.business_date, row);
  }

  // SDLW: key by the original date (shift +7 to get back)
  const sdlwMap = new Map<string, any>();
  for (const row of sdlwResult.data || []) {
    sdlwMap.set(row.business_date, row);
  }

  const rollupMap = new Map<string, any>();
  for (const row of rollupResult.data || []) {
    rollupMap.set(row.rollup_date, row);
  }

  // Build day rows
  const days: WeeklyAgendaDayRow[] = dates.map(date => {
    const facts = factsMap.get(date);
    const labor = laborMap.get(date);
    const forecast = forecastMap.get(date);
    const sdlwDate = shiftDate(date, -7);
    const sdlw = sdlwMap.get(sdlwDate);
    const rollup = rollupMap.get(date);

    const netSales = pf(facts?.net_sales);
    const covers = facts?.covers_count ?? 0;
    const forecastRev = forecast ? pf(forecast.revenue_predicted) : null;
    const forecastCovers = forecast ? pf(forecast.covers_predicted) : null;
    const sdlwNetSales = sdlw ? pf(sdlw.net_sales) : null;
    const sdlwCovers = sdlw ? (sdlw.covers_count ?? 0) : null;
    const laborCost = pf(labor?.labor_cost);
    const laborHours = pf(labor?.total_hours);

    // If venue was closed (no meaningful sales), suppress variance calculations
    const closed = netSales <= 0 && covers <= 0;

    return {
      business_date: date,
      day_of_week: getDayOfWeek(date),
      net_sales: netSales,
      gross_sales: pf(facts?.gross_sales),
      food_sales: pf(facts?.food_sales),
      beverage_sales: pf(facts?.beverage_sales),
      beverage_pct: pf(facts?.beverage_pct),
      covers_count: covers,
      checks_count: facts?.checks_count ?? 0,
      avg_check: pf(facts?.avg_check),
      comps_total: pf(facts?.comps_total),
      voids_total: pf(facts?.voids_total),
      forecast_revenue: forecastRev,
      vs_forecast_pct: closed ? null : pctChange(netSales, forecastRev),
      forecast_covers: forecastCovers,
      vs_forecast_covers_pct: closed ? null : pctChange(covers, forecastCovers),
      sdlw_net_sales: sdlwNetSales,
      vs_sdlw_pct: closed ? null : pctChange(netSales, sdlwNetSales),
      sdlw_covers: sdlwCovers,
      vs_sdlw_covers_pct: closed ? null : pctChange(covers, sdlwCovers),
      labor_cost: laborCost,
      labor_pct: netSales > 0 ? (laborCost / netSales) * 100 : 0,
      labor_hours: laborHours,
      ot_hours: pf(labor?.ot_hours),
      employee_count: labor?.employee_count ?? 0,
      foh_cost: pf(labor?.foh_cost),
      boh_cost: pf(labor?.boh_cost),
      splh: laborHours > 0 ? netSales / laborHours : 0,
      cplh: laborHours > 0 ? covers / laborHours : 0,
      comp_exception_count: rollup?.comp_exception_count ?? 0,
      labor_exception_count: rollup?.labor_exception_count ?? 0,
      carry_forward_count: rollup?.carry_forward_count ?? 0,
      critical_open_count: rollup?.critical_open_count ?? 0,
    };
  });

  // Compute totals
  const totals = computeTotals(days);

  // Build enforcement summary
  const enforcement = buildEnforcementSummary(
    rollupResult.data || [],
    compResolutionResult.data || [],
  );

  // Build labor insights from attestations
  const laborInsights = buildLaborInsights(attestationResult.data || []);

  // Build review summary
  const reviews = buildReviewSummary(
    reviewSignalsResult.data || [],
    negativeReviewsResult.data || [],
    unrespondedResult.count ?? 0,
  );

  return {
    venue_id: venueId,
    venue_name: venueName,
    week_start: weekStart,
    week_end: weekEnd,
    days,
    totals,
    enforcement,
    labor_insights: laborInsights,
    reviews,
    gm_notes: gmNotes,
    generated_at: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// AGGREGATION HELPERS
// ══════════════════════════════════════════════════════════════════════════

function computeTotals(days: WeeklyAgendaDayRow[]): WeeklyAgendaTotals {
  const netSales = days.reduce((s, d) => s + d.net_sales, 0);
  const grossSales = days.reduce((s, d) => s + d.gross_sales, 0);
  const foodSales = days.reduce((s, d) => s + d.food_sales, 0);
  const bevSales = days.reduce((s, d) => s + d.beverage_sales, 0);
  const covers = days.reduce((s, d) => s + d.covers_count, 0);
  const checks = days.reduce((s, d) => s + d.checks_count, 0);
  const comps = days.reduce((s, d) => s + d.comps_total, 0);
  const voids = days.reduce((s, d) => s + d.voids_total, 0);
  const laborCost = days.reduce((s, d) => s + d.labor_cost, 0);
  const laborHours = days.reduce((s, d) => s + d.labor_hours, 0);
  const otHours = days.reduce((s, d) => s + d.ot_hours, 0);

  // Forecast totals (sum only days that have forecasts)
  const forecastRevDays = days.filter(d => d.forecast_revenue != null);
  const totalForecast = forecastRevDays.length > 0
    ? forecastRevDays.reduce((s, d) => s + (d.forecast_revenue ?? 0), 0)
    : null;
  const forecastCoversDays = days.filter(d => d.forecast_covers != null);
  const totalForecastCovers = forecastCoversDays.length > 0
    ? forecastCoversDays.reduce((s, d) => s + (d.forecast_covers ?? 0), 0)
    : null;

  // SDLW totals (sum only days that have SDLW data)
  const sdlwRevDays = days.filter(d => d.sdlw_net_sales != null);
  const totalSdlw = sdlwRevDays.length > 0
    ? sdlwRevDays.reduce((s, d) => s + (d.sdlw_net_sales ?? 0), 0)
    : null;
  const sdlwCoversDays = days.filter(d => d.sdlw_covers != null);
  const totalSdlwCovers = sdlwCoversDays.length > 0
    ? sdlwCoversDays.reduce((s, d) => s + (d.sdlw_covers ?? 0), 0)
    : null;

  return {
    net_sales: netSales,
    gross_sales: grossSales,
    food_sales: foodSales,
    beverage_sales: bevSales,
    beverage_pct: netSales > 0 ? (bevSales / netSales) * 100 : 0,
    covers_count: covers,
    checks_count: checks,
    avg_check: checks > 0 ? netSales / checks : 0,
    comps_total: comps,
    comp_pct: netSales > 0 ? (comps / netSales) * 100 : 0,
    voids_total: voids,
    total_forecast_revenue: totalForecast,
    vs_forecast_pct: pctChange(netSales, totalForecast),
    total_forecast_covers: totalForecastCovers,
    vs_forecast_covers_pct: pctChange(covers, totalForecastCovers),
    total_sdlw_net_sales: totalSdlw,
    vs_sdlw_pct: pctChange(netSales, totalSdlw),
    total_sdlw_covers: totalSdlwCovers,
    vs_sdlw_covers_pct: pctChange(covers, totalSdlwCovers),
    total_labor_cost: laborCost,
    labor_pct: netSales > 0 ? (laborCost / netSales) * 100 : 0,
    total_labor_hours: laborHours,
    total_ot_hours: otHours,
    avg_splh: laborHours > 0 ? netSales / laborHours : 0,
    avg_cplh: laborHours > 0 ? covers / laborHours : 0,
  };
}

function buildEnforcementSummary(
  rollups: any[],
  compResolutions: any[],
): EnforcementSummary {
  let totalCompExceptions = 0;
  let totalLaborExceptions = 0;
  let totalProcurementExceptions = 0;
  let totalRevenueVariances = 0;
  let carryForward = 0;
  let criticalOpen = 0;
  let escalated = 0;
  let attSubmitted = 0;
  let attExpected = 0;

  for (const r of rollups) {
    totalCompExceptions += r.comp_exception_count ?? 0;
    totalLaborExceptions += r.labor_exception_count ?? 0;
    totalProcurementExceptions += r.procurement_exception_count ?? 0;
    totalRevenueVariances += r.revenue_variance_count ?? 0;
    carryForward += r.carry_forward_count ?? 0;
    criticalOpen += r.critical_open_count ?? 0;
    escalated += r.escalated_count ?? 0;
    attSubmitted += r.attestation_submitted ?? 0;
    attExpected += r.attestation_expected ?? 0;
  }

  // Aggregate comp resolutions by code
  const codeMap = new Map<string, CompResolutionBreakdown>();
  for (const cr of compResolutions) {
    const code = cr.resolution_code || 'unknown';
    const existing = codeMap.get(code) || {
      resolution_code: code,
      count: 0,
      total_amount: 0,
      policy_violation_count: 0,
      follow_up_required_count: 0,
    };
    existing.count += 1;
    existing.total_amount += pf(cr.comp_amount);
    if (cr.is_policy_violation) existing.policy_violation_count += 1;
    if (cr.requires_follow_up) existing.follow_up_required_count += 1;
    codeMap.set(code, existing);
  }

  return {
    total_comp_exceptions: totalCompExceptions,
    total_labor_exceptions: totalLaborExceptions,
    total_procurement_exceptions: totalProcurementExceptions,
    total_revenue_variances: totalRevenueVariances,
    carry_forward_count: carryForward,
    critical_open_count: criticalOpen,
    escalated_count: escalated,
    attestation_submitted: attSubmitted,
    attestation_expected: attExpected,
    attestation_compliance_pct: attExpected > 0 ? (attSubmitted / attExpected) * 100 : 100,
    comp_resolutions: Array.from(codeMap.values()).sort((a, b) => b.total_amount - a.total_amount),
  };
}

function buildLaborInsights(attestations: any[]): LaborInsight {
  const revReasons = new Map<string, number>();
  const laborReasons = new Map<string, number>();
  const laborTags = new Map<string, number>();

  for (const att of attestations) {
    if (att.revenue_variance_reason) {
      revReasons.set(att.revenue_variance_reason, (revReasons.get(att.revenue_variance_reason) || 0) + 1);
    }
    if (att.labor_variance_reason) {
      laborReasons.set(att.labor_variance_reason, (laborReasons.get(att.labor_variance_reason) || 0) + 1);
    }
    const tags: string[] = att.labor_tags || [];
    for (const tag of tags) {
      laborTags.set(tag, (laborTags.get(tag) || 0) + 1);
    }
  }

  const toArray = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([key, count]) => ({ reason: key, count }))
      .sort((a, b) => b.count - a.count);

  const toTagArray = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

  return {
    revenue_variance_reasons: toArray(revReasons),
    labor_variance_reasons: toArray(laborReasons),
    labor_tags: toTagArray(laborTags),
  };
}

function buildReviewSummary(
  signals: any[],
  negativeReviews: any[],
  unrespondedCount: number,
): ReviewSummary {
  let totalReviews = 0;
  let negativeTotal = 0;
  let ratingSum = 0;
  let ratingDays = 0;
  const sourceCounts: Record<string, number> = {};
  const tagCounts = new Map<string, number>();

  for (const s of signals) {
    totalReviews += s.review_count ?? 0;
    negativeTotal += s.neg_count ?? 0;
    if (s.avg_rating != null) {
      ratingSum += parseFloat(s.avg_rating) * (s.review_count ?? 0);
      ratingDays += s.review_count ?? 0;
    }
    // Aggregate source_mix
    const mix = s.source_mix || {};
    for (const [src, cnt] of Object.entries(mix)) {
      sourceCounts[src] = (sourceCounts[src] || 0) + (cnt as number);
    }
    // Aggregate tag_mix
    const tags = s.tag_mix || {};
    for (const [tag, cnt] of Object.entries(tags)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + (cnt as number));
    }
  }

  const topTags = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    total_reviews: totalReviews,
    negative_reviews: negativeTotal,
    avg_rating: ratingDays > 0 ? Math.round((ratingSum / ratingDays) * 100) / 100 : null,
    source_breakdown: sourceCounts,
    top_tags: topTags,
    unresponded_count: unrespondedCount,
    negative_review_texts: negativeReviews
      .filter(r => r.content) // only include reviews with text
      .slice(0, 10) // cap at 10
      .map(r => ({
        source: r.source,
        rating: parseFloat(r.rating),
        content: r.content,
        reviewed_at: r.reviewed_at,
        thirdparty_url: r.thirdparty_url,
      })),
  };
}
