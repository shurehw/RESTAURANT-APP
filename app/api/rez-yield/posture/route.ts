/**
 * Rez Yield Engine — Service Posture
 *
 * GET /api/rez-yield/posture?venue_id=xxx&date=YYYY-MM-DD&shift_type=dinner
 *
 * Returns current service posture + slot-level protection scores.
 * Used by the reservations page to show demand state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { getYieldConfigOrDefault, logPostureSnapshot } from '@/lib/database/rez-yield-config';
import { getSlotDemandMetrics, getPickupPace } from '@/lib/database/rez-yield-metrics';
import { getDemandCalendarEntry } from '@/lib/database/demand-calendar';
import {
  forecastDemand,
  forecastDuration,
  forecastWalkinPressure,
  forecastStress,
} from '@/lib/ai/rez-yield-forecaster';
import { computeServicePosture } from '@/lib/ai/rez-yield-policy';
import {
  getActiveAccessRulesForDate,
  getCoversBookedPerSlot,
} from '@/lib/database/reservations';
import { getActiveRezAgentPolicy, getPolicyValidationStatus } from '@/lib/ai/rez-agent-policy';

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  const policy = getActiveRezAgentPolicy();
  const policyValidation = getPolicyValidationStatus();

  let ctx: Awaited<ReturnType<typeof resolveContext>> | null = null;
  try {
    ctx = await resolveContext();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);

  const params = request.nextUrl.searchParams;
  const venueId = params.get('venue_id');
  const date = params.get('date') || new Date().toISOString().slice(0, 10);
  const shiftType = params.get('shift_type') || 'dinner';

  if (!venueId) {
    return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
  }
  assertVenueAccess(venueId, venueIds);

  const supabase = getServiceClient();
  const dow = new Date(date + 'T12:00:00').getDay();

  // ── Gather State ──

  const [config, accessRules, slotDemand, pickupPace, venueData, tablesData, demandCalendarResult] =
    await Promise.all([
      getYieldConfigOrDefault(venueId),
      getActiveAccessRulesForDate(venueId, date),
      getSlotDemandMetrics(venueId, date),
      getPickupPace(venueId, date),
      supabase.from('venues').select('name').eq('id', venueId).single(),
      supabase.from('venue_tables').select('id').eq('venue_id', venueId).eq('is_active', true),
      (async () => {
        try {
          return { entry: await getDemandCalendarEntry(venueId, date), error: null as string | null };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[rez-yield] Demand calendar lookup failed for venue=${venueId} date=${date}:`, message);
          return { entry: null, error: message };
        }
      })(),
    ]);
  const demandCalendar = demandCalendarResult.entry;

  const forecast = await supabase
    .from('demand_forecasts')
    .select('covers_predicted, revenue_predicted, walkin_covers_predicted')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType)
    .order('forecast_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const venueName = ((venueData as any)?.data?.name as string | undefined) || 'Unknown';
  const tableCount = ((((tablesData as any)?.data ?? []) as Array<{ id: string }>).length) || 30;

  // ── Compute ──

  const forecastCtx = {
    venue_id: venueId,
    venue_name: venueName,
    business_date: date,
    day_of_week: dow,
    shift_type: shiftType,
    is_event_night: demandCalendar?.has_private_event ?? false,
    is_holiday: demandCalendar?.is_holiday ?? false,
    demand_modifier: demandCalendar ? {
      multiplier: demandCalendar.demand_multiplier,
      narrative: demandCalendar.narrative,
      confidence: demandCalendar.confidence,
      is_quiet_period: demandCalendar.is_quiet_period,
      open_pacing_recommended: demandCalendar.open_pacing_recommended,
      lookahead_extension_days: demandCalendar.lookahead_extension_days,
      holiday_name: demandCalendar.holiday_name,
      has_private_event: demandCalendar.has_private_event,
      private_event_is_buyout: demandCalendar.private_event_is_buyout,
    } : undefined,
  };

  const demand = await forecastDemand(forecastCtx, forecast?.data, slotDemand, pickupPace);

  const coversPerSlot = await getCoversBookedPerSlot(venueId, date, 15);
  const bookingsPerSlot: Record<string, number> = {};
  for (const [slot, covers] of coversPerSlot) {
    bookingsPerSlot[slot] = covers;
  }

  const maxCovers = accessRules.length > 0
    ? Math.max(...accessRules.map((r) => r.max_covers_per_interval))
    : 20;

  const walkinPressure = await forecastWalkinPressure(
    forecastCtx, null, demand.service_level.expected_total_covers,
  );

  const baselineDuration = await forecastDuration(forecastCtx, 4);

  const stressSlots = await forecastStress(
    forecastCtx, bookingsPerSlot, maxCovers, baselineDuration.predicted_mins,
    tableCount,
  );

  const capacity: Record<string, number> = {};
  for (const slot of demand.slots) {
    capacity[slot.slot] = maxCovers;
  }

  const posture = computeServicePosture(
    demand, stressSlots, walkinPressure, bookingsPerSlot, capacity, config,
  );

  // ── Log snapshot ──
  try {
    await logPostureSnapshot({
      venue_id: venueId,
      business_date: date,
      shift_type: shiftType,
      posture: posture.posture,
      slot_scores: Object.fromEntries(
        posture.slots.map((s) => [s.slot, {
          protection: s.protection_score,
          fill_risk: s.fill_risk_score,
          future_opportunity: s.future_opportunity_score,
        }]),
      ),
      pickup_vs_pace: posture.metrics.pickup_vs_pace,
      total_booked: Math.round(posture.metrics.fill_pct * Object.values(capacity).reduce((s, v) => s + v, 0)),
      total_capacity: Object.values(capacity).reduce((s, v) => s + v, 0),
      demand_signals: {
        demand_strength: demand.demand_strength,
        denied_ratio: posture.metrics.denied_demand_ratio,
        walk_in_pressure: posture.metrics.walk_in_pressure,
      },
    });
  } catch (err) {
    console.error('[rez-yield] Failed to log posture:', err);
  }

  return NextResponse.json({
    ...posture,
    demand: {
      strength: demand.demand_strength,
      expected_covers: demand.service_level.expected_total_covers,
      walk_in_expected: demand.service_level.walk_in_expected,
      sellout_probability: demand.service_level.sellout_probability,
      pickup_pace_ratio: demand.pickup_pace_ratio,
    },
    config: {
      yield_engine_enabled: config.yield_engine_enabled,
      automation_level: config.automation_level,
      aggressiveness_ceiling: config.aggressiveness_ceiling,
    },
    calendar: demandCalendar ? {
      demand_multiplier: demandCalendar.demand_multiplier,
      narrative: demandCalendar.narrative,
      is_holiday: demandCalendar.is_holiday,
      holiday_name: demandCalendar.holiday_name,
      is_quiet_period: demandCalendar.is_quiet_period,
      has_private_event: demandCalendar.has_private_event,
      private_event_is_buyout: demandCalendar.private_event_is_buyout,
      open_pacing_recommended: demandCalendar.open_pacing_recommended,
      confidence: demandCalendar.confidence,
    } : null,
    calendar_status: demandCalendarResult.error
      ? 'unavailable'
      : demandCalendar
        ? 'ok'
        : 'missing',
    policy: {
      version: policy.policy_version,
      effective_date: policy.effective_date,
      active_tier: policy.automation_tiers.active_tier,
      stress_score_max: policy.hard_constraints.stress_score_max,
      deny_if_confidence_below: policy.hard_constraints.deny_if_confidence_below,
      validation_ok: policyValidation.valid,
      validation_errors: policyValidation.errors,
    },
    elapsed_ms: Date.now() - t0,
  });
}
