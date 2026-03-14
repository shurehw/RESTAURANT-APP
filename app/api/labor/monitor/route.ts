/**
 * Staffing Monitor Endpoint (Pre-Service + Mid-Service)
 *
 * GET /api/labor/monitor — Called by external scheduler or piggybacked on sales/poll.
 *
 * PRE-SERVICE (hours before open):
 * 1. Compare forecast + reservation covers vs published schedule
 * 2. Detect forecast changes and reservation pacing
 * 3. Recommend call-offs (cancel shifts) or call-ins before staff arrives
 *
 * MID-SERVICE (during service):
 * 1. Compare live covers vs forecast at current point in service
 * 2. Compare actual labor vs demand
 * 3. Recommend early cuts, call-ins, or flag OT risk
 *
 * Auth: x-cron-secret header or Bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getActiveSalesPaceVenues,
  getSalesPaceSettings,
  getVenueTimezone,
  getBusinessDateForTimezone,
  isWithinServiceHoursForTimezone,
  getNowInTimezone,
  getTipseeMappingForVenue,
} from '@/lib/database/sales-pace';
import {
  getMidServiceThresholds,
  fetchActiveEmployees,
  getDemandCurveForVenue,
  getForecastForDate,
  storeMonitoringSnapshot,
  storeRecommendedAdjustments,
  expireStaleAdjustments,
  getScheduledShiftsForDate,
  getReservationSummaryForDate,
  getPreviousForecast,
} from '@/lib/database/shift-monitoring';
import { evaluateStaffingState, evaluatePreServiceState } from '@/lib/scheduling-agent';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;
  return false;
}

/** Map JS day-of-week (0=Sun) to demand_distribution_curves.day_type */
function dowToDayType(dow: number): string {
  switch (dow) {
    case 0: return 'sunday';
    case 5: return 'friday';
    case 6: return 'saturday';
    default: return 'weekday';
  }
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
        message: 'No active venues',
        venues_processed: 0,
      });
    }

    const results = await Promise.allSettled(
      venues.map((v) => processVenueMonitoring(v.venue_id))
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
    console.error('Monitor error:', error);
    return NextResponse.json(
      { error: error.message || 'Monitor failed' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PER-VENUE MONITORING
// ══════════════════════════════════════════════════════════════════════════

async function processVenueMonitoring(venueId: string): Promise<{
  monitored: boolean;
  phase: 'pre_service' | 'mid_service' | 'skipped';
  action: string;
  adjustments_count: number;
  skipped_reason?: string;
}> {
  // Check thresholds — is monitoring active for this venue?
  const thresholds = await getMidServiceThresholds(venueId);
  if (!thresholds.is_active) {
    return { monitored: false, phase: 'skipped', action: 'none', adjustments_count: 0, skipped_reason: 'monitoring_disabled' };
  }

  const tz = await getVenueTimezone(venueId);
  const localNow = getNowInTimezone(tz);
  const currentTimeLocal = `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}`;

  // Get venue open/close hours from location_config
  const supabase = getServiceClient();
  let venueOpenHour = 18;
  let venueCloseHour = 2;
  try {
    const { data: locConfig } = await (supabase as any)
      .from('location_config')
      .select('open_hour, close_hour')
      .eq('venue_id', venueId)
      .single();
    if (locConfig) {
      venueOpenHour = locConfig.open_hour ?? 18;
      venueCloseHour = locConfig.close_hour ?? 2;
    }
  } catch { /* defaults are fine */ }

  // Determine phase: pre-service or mid-service
  const settings = await getSalesPaceSettings(venueId);
  const startHour = settings?.service_start_hour ?? 11;
  const endHour = settings?.service_end_hour ?? 2;
  const isDuringService = isWithinServiceHoursForTimezone(startHour, endHour, tz);

  // Pre-service window: N hours before venue opens
  const currentHour = localNow.getHours() + localNow.getMinutes() / 60;
  const hoursUntilService = venueOpenHour > currentHour
    ? venueOpenHour - currentHour
    : venueOpenHour + 24 - currentHour; // overnight wrap
  const isPreService = !isDuringService && hoursUntilService <= thresholds.pre_service_window_hours && hoursUntilService > 0;

  // Determine business date — for pre-service, use today's date (not yesterday)
  const businessDate = isDuringService
    ? getBusinessDateForTimezone(tz)
    : (() => {
        const y = localNow.getFullYear();
        const m = String(localNow.getMonth() + 1).padStart(2, '0');
        const d = String(localNow.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      })();

  if (isPreService) {
    return processPreService(venueId, businessDate, currentTimeLocal, venueOpenHour, venueCloseHour, hoursUntilService, localNow, thresholds);
  }

  if (isDuringService) {
    return processMidService(venueId, businessDate, currentTimeLocal, venueOpenHour, venueCloseHour, localNow, thresholds, tz);
  }

  return { monitored: false, phase: 'skipped', action: 'none', adjustments_count: 0, skipped_reason: 'outside_monitoring_window' };
}

// ══════════════════════════════════════════════════════════════════════════
// PRE-SERVICE PROCESSING
// ══════════════════════════════════════════════════════════════════════════

async function processPreService(
  venueId: string,
  businessDate: string,
  currentTimeLocal: string,
  venueOpenHour: number,
  venueCloseHour: number,
  hoursUntilService: number,
  localNow: Date,
  thresholds: Awaited<ReturnType<typeof getMidServiceThresholds>>
): Promise<{ monitored: boolean; phase: 'pre_service'; action: string; adjustments_count: number; skipped_reason?: string }> {
  // Fetch forecast, previous forecast, reservations, and scheduled shifts in parallel
  const [forecast, previousForecast, reservations, scheduledShifts] = await Promise.all([
    getForecastForDate(venueId, businessDate),
    getPreviousForecast(venueId, businessDate),
    getReservationSummaryForDate(venueId, businessDate),
    getScheduledShiftsForDate(venueId, businessDate),
  ]);

  if (!forecast || forecast.covers_predicted === 0) {
    return { monitored: false, phase: 'pre_service', action: 'none', adjustments_count: 0, skipped_reason: 'no_forecast' };
  }

  if (scheduledShifts.length === 0) {
    return { monitored: false, phase: 'pre_service', action: 'none', adjustments_count: 0, skipped_reason: 'no_scheduled_shifts' };
  }

  // Expire stale pending adjustments
  await expireStaleAdjustments(venueId, businessDate);

  // Run pre-service decision engine
  const result = evaluatePreServiceState({
    venueId,
    businessDate,
    currentTimeLocal,
    venueOpenHour,
    venueCloseHour,
    hoursUntilService,
    forecastedDailyCovers: forecast.covers_predicted,
    previousForecastCovers: previousForecast,
    reservations,
    scheduledShifts,
    thresholds,
  });

  // Store monitoring snapshot
  const snapshotId = await storeMonitoringSnapshot({
    venue_id: venueId,
    business_date: businessDate,
    shift_type: 'pre_service',
    current_covers: 0,
    current_revenue: 0,
    current_staff_count: result.scheduledStaffCount,
    current_labor_cost: result.scheduledLaborCost,
    current_labor_hours: 0,
    current_splh: 0,
    remaining_demand_pct: 1.0,
    forecasted_covers: result.forecastedCovers,
    variance_from_forecast: result.forecastChangePct ?? 0,
    recommended_action: result.recommended_action as any,
    recommended_details: {
      ...result.recommended_details,
      phase: 'pre_service',
      reservation_covers: result.reservationCovers,
      rez_vs_forecast_pct: result.rezVsForecastPct,
      hours_until_service: hoursUntilService,
    },
  });

  // Store recommended adjustments
  if (result.adjustments.length > 0) {
    await storeRecommendedAdjustments(
      result.adjustments.map((a) => ({
        venue_id: venueId,
        business_date: businessDate,
        action_type: a.action_type as any,
        employee_id: a.employeeId || '00000000-0000-0000-0000-000000000000',
        employee_name: a.employeeName,
        position: a.position,
        reason: a.reason,
        covers_at_decision: 0,
        forecast_covers: result.forecastedCovers,
        cost_savings: a.estimatedSavings,
        new_end_time: a.newEndTime,
        monitoring_snapshot_id: snapshotId || undefined,
      }))
    );
  }

  return {
    monitored: true,
    phase: 'pre_service',
    action: result.recommended_action,
    adjustments_count: result.adjustments.length,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// MID-SERVICE PROCESSING
// ══════════════════════════════════════════════════════════════════════════

async function processMidService(
  venueId: string,
  businessDate: string,
  currentTimeLocal: string,
  venueOpenHour: number,
  venueCloseHour: number,
  localNow: Date,
  thresholds: Awaited<ReturnType<typeof getMidServiceThresholds>>,
  tz: string
): Promise<{ monitored: boolean; phase: 'mid_service'; action: string; adjustments_count: number; skipped_reason?: string }> {
  const supabase = getServiceClient();

  // Fetch latest sales snapshot for current state
  const { data: latestSnap } = await (supabase as any)
    .from('sales_snapshots')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', businessDate)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestSnap) {
    return { monitored: false, phase: 'mid_service', action: 'none', adjustments_count: 0, skipped_reason: 'no_sales_data' };
  }

  // Fetch forecast + demand curve + active employees in parallel
  const dayType = dowToDayType(localNow.getDay());
  const locationUuids = await getTipseeMappingForVenue(venueId);
  const tipseeLocationUuid = locationUuids.length > 0 ? locationUuids[0] : null;

  const [forecast, demandCurve, activeEmployees] = await Promise.all([
    getForecastForDate(venueId, businessDate),
    getDemandCurveForVenue(venueId, dayType),
    tipseeLocationUuid
      ? fetchActiveEmployees(tipseeLocationUuid, businessDate, venueCloseHour, thresholds.close_window_minutes)
      : Promise.resolve([]),
  ]);

  if (!forecast || forecast.covers_predicted === 0) {
    return { monitored: false, phase: 'mid_service', action: 'none', adjustments_count: 0, skipped_reason: 'no_forecast' };
  }

  if (activeEmployees.length === 0) {
    return { monitored: false, phase: 'mid_service', action: 'none', adjustments_count: 0, skipped_reason: 'no_active_employees' };
  }

  // Expire stale pending adjustments
  await expireStaleAdjustments(venueId, businessDate);

  // Run decision engine
  const result = evaluateStaffingState({
    venueId,
    businessDate,
    currentTimeLocal,
    venueOpenHour,
    venueCloseHour,
    currentCovers: Number(latestSnap.covers_count) || 0,
    currentRevenue: Number(latestSnap.net_sales) || 0,
    currentLaborCost: Number(latestSnap.labor_cost) || 0,
    currentLaborHours: Number(latestSnap.labor_hours) || 0,
    forecastedDailyCovers: forecast.covers_predicted,
    demandCurve,
    activeEmployees,
    thresholds,
  });

  // Store monitoring snapshot
  const snapshotId = await storeMonitoringSnapshot({
    venue_id: venueId,
    business_date: businessDate,
    shift_type: 'dinner',
    current_covers: result.snapshot.current_covers,
    current_revenue: result.snapshot.current_revenue,
    current_staff_count: result.snapshot.current_staff_count,
    current_labor_cost: result.snapshot.current_labor_cost,
    current_labor_hours: result.snapshot.current_labor_hours,
    current_splh: result.snapshot.current_splh,
    remaining_demand_pct: result.snapshot.remaining_demand_pct,
    forecasted_covers: result.snapshot.forecasted_covers_at_this_point,
    variance_from_forecast: result.snapshot.variance_pct,
    recommended_action: result.snapshot.recommended_action,
    recommended_details: result.snapshot.recommended_details,
  });

  // Store recommended adjustments
  if (result.adjustments.length > 0) {
    await storeRecommendedAdjustments(
      result.adjustments.map((a) => ({
        venue_id: venueId,
        business_date: businessDate,
        action_type: a.action_type,
        employee_id: a.employeeId || '00000000-0000-0000-0000-000000000000',
        employee_name: a.employeeName,
        position: a.position,
        reason: a.reason,
        covers_at_decision: result.snapshot.current_covers,
        forecast_covers: result.snapshot.forecasted_covers_at_this_point,
        cost_savings: a.estimatedSavings,
        new_end_time: a.newEndTime,
        monitoring_snapshot_id: snapshotId || undefined,
      }))
    );
  }

  return {
    monitored: true,
    phase: 'mid_service',
    action: result.snapshot.recommended_action,
    adjustments_count: result.adjustments.length,
  };
}

/**
 * Exported for integration with sales/poll endpoint.
 * Call this after storing the sales snapshot.
 */
export { processVenueMonitoring as runMidServiceMonitor };
