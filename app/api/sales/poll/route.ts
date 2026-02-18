/**
 * Sales Pace Polling Endpoint
 *
 * GET /api/sales/poll — Called by an external scheduler (QStash, cron-job.org, etc.)
 *
 * For each active venue with sales pace monitoring enabled:
 * 1. Check if within service hours (skip if closed)
 * 2. Fetch current-day running totals from TipSee
 * 3. Fetch labor + comp data from TipSee (parallel)
 * 4. Store enriched snapshot in sales_snapshots table
 *
 * Auth: x-cron-secret header or Bearer token (matches camera poll pattern)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveSalesPaceVenues,
  getSalesPaceSettings,
  storeSalesSnapshot,
  upsertLaborDayFact,
  getTipseeMappingForVenue,
  getVenueTimezone,
  getBusinessDateForTimezone,
  isWithinServiceHoursForTimezone,
} from '@/lib/database/sales-pace';
import {
  fetchIntraDaySummary,
  fetchSimphonyIntraDaySummary,
  fetchSimphonyBIIntraDaySummary,
  getPosTypeForLocations,
  fetchLaborSummary,
  fetchCompExceptions,
} from '@/lib/database/tipsee';
import { getCompSettingsForVenue } from '@/lib/database/comp-settings';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const targetVenueId = request.nextUrl.searchParams.get('venue_id');

  try {
    const venues = targetVenueId
      ? [{ venue_id: targetVenueId, polling_interval_seconds: 300 }]
      : await getActiveSalesPaceVenues();

    if (venues.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active venues with sales pace monitoring',
        venues_processed: 0,
      });
    }

    const results = await Promise.allSettled(
      venues.map((v) => processVenue(v.venue_id))
    );

    const summary = results.map((r, i) => ({
      venue_id: venues[i].venue_id,
      status: r.status,
      ...(r.status === 'fulfilled' ? r.value : { error: (r as any).reason?.message }),
    }));

    return NextResponse.json({
      success: true,
      venues_processed: venues.length,
      results: summary,
    });
  } catch (error: any) {
    console.error('Sales poll error:', error);
    return NextResponse.json(
      { error: error.message || 'Poll failed' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PER-VENUE PROCESSING
// ══════════════════════════════════════════════════════════════════════════

async function processVenue(venueId: string): Promise<{
  snapshot_stored: boolean;
  net_sales: number;
  covers: number;
  checks: number;
  labor_cost?: number;
  comp_exceptions?: number;
  skipped_reason?: string;
}> {
  const settings = await getSalesPaceSettings(venueId);
  const tz = await getVenueTimezone(venueId);

  // Check service hours (in venue's local timezone)
  const startHour = settings?.service_start_hour ?? 11;
  const endHour = settings?.service_end_hour ?? 3;
  if (!isWithinServiceHoursForTimezone(startHour, endHour, tz)) {
    return { snapshot_stored: false, net_sales: 0, covers: 0, checks: 0, skipped_reason: 'outside_service_hours' };
  }

  // Get TipSee mapping
  const locationUuids = await getTipseeMappingForVenue(venueId);
  if (locationUuids.length === 0) {
    return { snapshot_stored: false, net_sales: 0, covers: 0, checks: 0, skipped_reason: 'no_tipsee_mapping' };
  }

  // Determine business date (before 5 AM local = previous day)
  const businessDate = getBusinessDateForTimezone(tz);

  // Detect POS type and fetch running totals from the right source.
  // Simphony venues: try direct BI API first (live ~90s), then TipSee fallbacks.
  // Upserve venues: TipSee tipsee_checks (real-time).
  const posType = await getPosTypeForLocations(locationUuids);
  let summary;

  if (posType === 'simphony') {
    // 1. Try Simphony BI API (direct POS query — freshest data)
    try {
      summary = await fetchSimphonyBIIntraDaySummary(venueId, businessDate);
    } catch (err: any) {
      console.warn(`[sales-poll] Simphony BI API failed for ${venueId}: ${err.message}`);
      summary = { total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0, food_sales: 0, beverage_sales: 0, comps_total: 0, voids_total: 0 };
    }

    // 2. Fall back to TipSee tipsee_simphony_sales (batch/delayed)
    if (summary.net_sales === 0 && summary.total_checks === 0) {
      summary = await fetchSimphonyIntraDaySummary(locationUuids, businessDate);
    }

    // 3. Fall back to TipSee tipsee_checks
    if (summary.net_sales === 0 && summary.total_checks === 0) {
      summary = await fetchIntraDaySummary(locationUuids, businessDate);
    }
  } else {
    summary = await fetchIntraDaySummary(locationUuids, businessDate);
  }

  // Skip if no sales activity yet
  if (summary.net_sales === 0 && summary.total_checks === 0) {
    return { snapshot_stored: false, net_sales: 0, covers: 0, checks: 0, skipped_reason: 'no_sales' };
  }

  // Fetch labor + comp data in parallel (non-blocking — sales snapshot still stores even if these fail)
  const [laborResult, compResult] = await Promise.allSettled([
    fetchLaborSummary(locationUuids[0], businessDate, summary.net_sales, summary.total_covers),
    (async () => {
      const compSettings = await getCompSettingsForVenue(venueId);
      return fetchCompExceptions(
        businessDate,
        locationUuids[0],
        compSettings ? {
          approved_reasons: compSettings.approved_reasons,
          high_value_comp_threshold: compSettings.high_value_comp_threshold,
          high_comp_pct_threshold: compSettings.high_comp_pct_threshold,
          daily_comp_pct_warning: compSettings.daily_comp_pct_warning,
          daily_comp_pct_critical: compSettings.daily_comp_pct_critical,
        } : undefined
      );
    })(),
  ]);

  const labor = laborResult.status === 'fulfilled' ? laborResult.value : null;
  const compData = compResult.status === 'fulfilled' ? compResult.value : null;

  // Build top exceptions array for JSONB storage
  const topExceptions = compData
    ? compData.exceptions.slice(0, 5).map(e => ({
        type: e.type,
        severity: e.severity,
        server: e.server,
        comp_total: e.comp_total,
        message: e.message,
      }))
    : [];

  // Store enriched snapshot
  const now = new Date().toISOString();
  await storeSalesSnapshot({
    venue_id: venueId,
    business_date: businessDate,
    snapshot_at: now,
    gross_sales: summary.gross_sales,
    net_sales: summary.net_sales,
    food_sales: summary.food_sales,
    beverage_sales: summary.beverage_sales,
    checks_count: summary.total_checks,
    covers_count: summary.total_covers,
    comps_total: summary.comps_total,
    voids_total: summary.voids_total,
    // Labor enrichment
    labor_cost: labor?.labor_cost ?? 0,
    labor_hours: labor?.total_hours ?? 0,
    labor_employee_count: labor?.employee_count ?? 0,
    labor_ot_hours: labor?.ot_hours ?? 0,
    labor_foh_cost: labor?.foh?.cost ?? 0,
    labor_boh_cost: labor?.boh?.cost ?? 0,
    labor_other_cost: labor?.other?.cost ?? 0,
    // Comp enrichment
    comp_exception_count: compData?.summary.exception_count ?? 0,
    comp_critical_count: compData?.summary.critical_count ?? 0,
    comp_warning_count: compData?.summary.warning_count ?? 0,
    comp_top_exceptions: topExceptions,
  });

  // Sync labor into labor_day_facts (keeps Supabase as source of truth)
  if (labor) {
    await upsertLaborDayFact(venueId, businessDate, labor, summary.net_sales, summary.total_covers);
  }

  return {
    snapshot_stored: true,
    net_sales: summary.net_sales,
    covers: summary.total_covers,
    checks: summary.total_checks,
    labor_cost: labor?.labor_cost,
    comp_exceptions: compData?.summary.exception_count,
  };
}
