/**
 * Staffing Agent Status API
 *
 * GET /api/labor/agent-status?venue_id=...&business_date=...
 *
 * Returns the current agent state: phase, monitoring snapshots, pending adjustments,
 * forecast, reservation summary, and decision timeline for the dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getMidServiceThresholds,
  getForecastForDate,
  getReservationSummaryForDate,
  getScheduledShiftsForDate,
  getPendingAdjustments,
} from '@/lib/database/shift-monitoring';
import {
  getVenueTimezone,
  getNowInTimezone,
  getBusinessDateForTimezone,
  isWithinServiceHoursForTimezone,
  getSalesPaceSettings,
} from '@/lib/database/sales-pace';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    const dateParam = request.nextUrl.searchParams.get('business_date');

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const supabase = getServiceClient();
    const tz = await getVenueTimezone(venueId);
    const localNow = getNowInTimezone(tz);
    const businessDate = dateParam || getBusinessDateForTimezone(tz);

    // Determine phase
    const settings = await getSalesPaceSettings(venueId);
    const startHour = settings?.service_start_hour ?? 11;
    const endHour = settings?.service_end_hour ?? 2;
    const isDuringService = isWithinServiceHoursForTimezone(startHour, endHour, tz);

    let venueOpenHour = 18;
    try {
      const { data: locConfig } = await (supabase as any)
        .from('location_config')
        .select('open_hour')
        .eq('venue_id', venueId)
        .single();
      if (locConfig) venueOpenHour = locConfig.open_hour ?? 18;
    } catch {}

    const currentHour = localNow.getHours() + localNow.getMinutes() / 60;
    const hoursUntilService = venueOpenHour > currentHour
      ? venueOpenHour - currentHour
      : venueOpenHour + 24 - currentHour;

    const thresholds = await getMidServiceThresholds(venueId);
    const isPreService = !isDuringService && hoursUntilService <= thresholds.pre_service_window_hours && hoursUntilService > 0;

    const phase = isDuringService ? 'mid_service' : isPreService ? 'pre_service' : 'inactive';

    // Fetch all data in parallel
    const [
      forecast,
      reservations,
      scheduledShifts,
      pendingAdjustments,
      snapshotsResult,
      timelineResult,
    ] = await Promise.all([
      getForecastForDate(venueId, businessDate),
      getReservationSummaryForDate(venueId, businessDate),
      getScheduledShiftsForDate(venueId, businessDate),
      getPendingAdjustments(venueId, businessDate),
      (supabase as any)
        .from('shift_monitoring')
        .select('*')
        .eq('venue_id', venueId)
        .eq('business_date', businessDate)
        .order('snapshot_time', { ascending: false })
        .limit(1),
      (supabase as any)
        .from('shift_monitoring')
        .select('snapshot_time, current_covers, current_revenue, current_staff_count, current_splh, forecasted_covers, variance_from_forecast, recommended_action, remaining_demand_pct, shift_type')
        .eq('venue_id', venueId)
        .eq('business_date', businessDate)
        .order('snapshot_time', { ascending: true }),
    ]);

    const latestSnapshot = snapshotsResult.data?.[0] || null;
    const timeline = timelineResult.data || [];

    // All-day adjustment history (all statuses)
    const { data: allAdjustments } = await (supabase as any)
      .from('realtime_adjustments')
      .select('*')
      .eq('venue_id', venueId)
      .eq('business_date', businessDate)
      .order('created_at', { ascending: false });

    // Latest sales snapshot for live metrics
    const { data: latestSales } = await (supabase as any)
      .from('sales_snapshots')
      .select('covers_count, net_sales, labor_cost, labor_hours, labor_employee_count, labor_ot_hours, snapshot_at')
      .eq('venue_id', venueId)
      .eq('business_date', businessDate)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .single();

    // FOH/BOH counts from scheduled shifts
    const fohScheduled = scheduledShifts.filter(s => s.category === 'front_of_house').length;
    const bohScheduled = scheduledShifts.filter(s => s.category === 'back_of_house').length;
    const mgmtScheduled = scheduledShifts.filter(s => s.category === 'management').length;
    const scheduledLaborCost = scheduledShifts.reduce((sum, s) => sum + s.shiftCost, 0);

    return NextResponse.json({
      success: true,
      phase,
      businessDate,
      currentTime: `${String(localNow.getHours()).padStart(2, '0')}:${String(localNow.getMinutes()).padStart(2, '0')}`,
      hoursUntilService: phase === 'pre_service' ? Math.round(hoursUntilService * 10) / 10 : null,
      thresholds,
      forecast: forecast ? {
        covers_predicted: forecast.covers_predicted,
        revenue_predicted: forecast.revenue_predicted,
      } : null,
      reservations,
      staffing: {
        total_scheduled: scheduledShifts.length,
        foh_scheduled: fohScheduled,
        boh_scheduled: bohScheduled,
        mgmt_scheduled: mgmtScheduled,
        scheduled_labor_cost: scheduledLaborCost,
      },
      live: latestSales ? {
        covers: Number(latestSales.covers_count) || 0,
        revenue: Number(latestSales.net_sales) || 0,
        labor_cost: Number(latestSales.labor_cost) || 0,
        labor_hours: Number(latestSales.labor_hours) || 0,
        staff_on_floor: Number(latestSales.labor_employee_count) || 0,
        ot_hours: Number(latestSales.labor_ot_hours) || 0,
        splh: Number(latestSales.labor_hours) > 0
          ? Math.round(Number(latestSales.net_sales) / Number(latestSales.labor_hours) * 100) / 100
          : 0,
        last_updated: latestSales.snapshot_at,
      } : null,
      latestSnapshot: latestSnapshot ? {
        recommended_action: latestSnapshot.recommended_action,
        variance_pct: Number(latestSnapshot.variance_from_forecast) || 0,
        remaining_demand_pct: Number(latestSnapshot.remaining_demand_pct) || 0,
        current_splh: Number(latestSnapshot.current_splh) || 0,
        details: latestSnapshot.recommended_details,
        snapshot_time: latestSnapshot.snapshot_time,
      } : null,
      pendingAdjustments,
      adjustmentHistory: (allAdjustments || []).map((a: any) => ({
        id: a.id,
        action_type: a.action_type,
        employee_name: a.employee_name,
        position: a.position,
        reason: a.reason,
        cost_savings: Number(a.cost_savings) || 0,
        status: a.status,
        created_at: a.created_at,
        approved_at: a.approved_at,
      })),
      timeline: timeline.map((t: any) => ({
        time: t.snapshot_time,
        covers: Number(t.current_covers) || 0,
        revenue: Number(t.current_revenue) || 0,
        staff: Number(t.current_staff_count) || 0,
        splh: Number(t.current_splh) || 0,
        forecasted_covers: Number(t.forecasted_covers) || 0,
        variance: Number(t.variance_from_forecast) || 0,
        action: t.recommended_action,
        remaining_pct: Number(t.remaining_demand_pct) || 0,
        shift_type: t.shift_type,
      })),
    });
  });
}
