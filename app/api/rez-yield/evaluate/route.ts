/**
 * Rez Yield Engine — Request Evaluation
 *
 * POST /api/rez-yield/evaluate
 *
 * Evaluates an inbound reservation request and returns a recommendation
 * with full reasoning, alternatives, predictions, and table assignments.
 *
 * Phase 1: Decision support only — returns recommendation, does not execute.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getServiceClient } from '@/lib/supabase/service';
import { getYieldConfigOrDefault, logYieldDecision } from '@/lib/database/rez-yield-config';
import { getSlotDemandMetrics, getPickupPace } from '@/lib/database/rez-yield-metrics';
import {
  forecastDemand,
  forecastDuration,
  forecastShowProbability,
  forecastSpend,
  forecastWalkinPressure,
  forecastStress,
} from '@/lib/ai/rez-yield-forecaster';
import {
  computeServicePosture,
  evaluateRequest,
  generateDecisionReasoning,
} from '@/lib/ai/rez-yield-policy';
import {
  getActiveAccessRulesForDate,
  getReservationsForVenueDate,
  getCoversBookedPerSlot,
} from '@/lib/database/reservations';
import { fetchHistoricalNoShowRate } from '@/lib/database/tipsee';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';
import { getDemandCalendarEntry } from '@/lib/database/demand-calendar';
import {
  classifyRiskBand,
  getActiveRezAgentPolicy,
  getPolicyValidationStatus,
  shouldAutoExecute,
} from '@/lib/ai/rez-agent-policy';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const policy = getActiveRezAgentPolicy();
  const policyValidation = getPolicyValidationStatus();

  // Auth
  let ctx: Awaited<ReturnType<typeof resolveContext>> | null = null;
  try {
    ctx = await resolveContext();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ctx.orgId) {
    return NextResponse.json({ error: 'No organization context' }, { status: 403 });
  }
  const orgId = ctx.orgId;

  const body = await request.json();
  const {
    venue_id,
    service_date,
    requested_time,
    party_size,
    channel = 'direct',
    guest_email,
    guest_phone,
    is_vip = false,
  } = body;

  if (!venue_id || !service_date || !requested_time || !party_size) {
    return NextResponse.json(
      { error: 'Missing required fields: venue_id, service_date, requested_time, party_size' },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const date = service_date;
  const dow = new Date(date + 'T12:00:00').getDay();

  // ── Gather State (parallel) ──

  const [
    config,
    accessRules,
    reservations,
    slotDemand,
    pickupPace,
    guestProfile,
    noShowData,
    venueData,
    tablesData,
    demandCalendarResult,
  ] = await Promise.all([
    getYieldConfigOrDefault(venue_id),
    getActiveAccessRulesForDate(venue_id, date),
    getReservationsForVenueDate(venue_id, date),
    getSlotDemandMetrics(venue_id, date),
    getPickupPace(venue_id, date),
    // Guest profile lookup
    (async () => {
      if (!guest_email && !guest_phone) return null;
      const q = (supabase.from('guest_profiles') as any).select('*').eq('org_id', orgId);
      if (guest_email) q.eq('email', guest_email);
      else if (guest_phone) q.eq('phone', guest_phone);
      const { data } = await q.maybeSingle();
      return data;
    })(),
    // Historical no-show rate
    (async () => {
      const locationUuids = await getTipseeMappingForVenue(venue_id);
      if (!locationUuids.length) return { rate: 0.08 };
      return fetchHistoricalNoShowRate(locationUuids, dow, 90);
    })(),
    // Venue info
    supabase.from('venues').select('name').eq('id', venue_id).single(),
    // Available tables
    supabase
      .from('venue_tables')
      .select('id, table_number, min_capacity, max_capacity, section_id, shape')
      .eq('venue_id', venue_id)
      .eq('is_active', true),
    // Demand calendar entry
    (async () => {
      try {
        return { entry: await getDemandCalendarEntry(venue_id, date), error: null as string | null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[rez-yield] Demand calendar lookup failed for venue=${venue_id} date=${date}:`, message);
        return { entry: null, error: message };
      }
    })(),
  ]);
  const demandCalendar = demandCalendarResult.entry;

  // Get forecast baseline
  const { data: forecast } = await supabase
    .from('demand_forecasts')
    .select('covers_predicted, revenue_predicted, walkin_covers_predicted')
    .eq('venue_id', venue_id)
    .eq('business_date', date)
    .eq('shift_type', 'dinner')
    .order('forecast_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Compute venue day facts for avg check
  const { data: dayFactsRaw } = await supabase
    .from('venue_day_facts')
    .select('avg_check')
    .eq('venue_id', venue_id)
    .order('business_date', { ascending: false })
    .limit(30);
  const dayFacts = (dayFactsRaw ?? []) as Array<{ avg_check: number | null }>;

  const avgCheck = dayFacts.length > 0
    ? dayFacts.reduce((s, d) => s + (d.avg_check || 0), 0) / dayFacts.length
    : 85;
  const venueName = ((venueData as any)?.data?.name as string | undefined) || 'Unknown';
  const tableRows = (((tablesData as any)?.data ?? []) as Array<{
    id: string;
    table_number: string;
    min_capacity: number;
    max_capacity: number;
    section_id: string | null;
    shape: string;
  }>);

  // ── Build Forecast Context ──

  const forecastCtx = {
    venue_id,
    venue_name: venueName,
    business_date: date,
    day_of_week: dow,
    shift_type: 'dinner',
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

  // ── Run Models ──

  // Demand forecast
  const demand = await forecastDemand(forecastCtx, forecast, slotDemand, pickupPace);

  // Duration prediction
  const duration = await forecastDuration(
    forecastCtx, party_size, undefined, guestProfile, is_vip,
  );

  // Show probability
  const leadDays = Math.max(0,
    (new Date(date).getTime() - Date.now()) / 86400000,
  );
  const showProb = await forecastShowProbability(
    forecastCtx, guestProfile, channel, leadDays, false, noShowData.rate,
  );

  // Spend prediction
  const spend = await forecastSpend(forecastCtx, party_size, guestProfile, avgCheck);

  // Walk-in pressure for requested slot
  const walkinPressure = await forecastWalkinPressure(
    forecastCtx,
    null, // will use defaults
    demand.service_level.expected_total_covers,
  );
  const walkinSlot = walkinPressure.find((w) => w.slot === requested_time) || null;

  // Stress forecast
  const coversPerSlot = await getCoversBookedPerSlot(venue_id, date, 15);
  const bookingsPerSlot: Record<string, number> = {};
  for (const [slot, covers] of coversPerSlot) {
    bookingsPerSlot[slot] = covers;
  }

  const maxCovers = accessRules.length > 0
    ? Math.max(...accessRules.map((r) => r.max_covers_per_interval))
    : 20;

  const stressSlots = await forecastStress(
    forecastCtx, bookingsPerSlot, maxCovers, duration.predicted_mins,
    tableRows.length || 30,
  );

  // ── Compute Posture ──

  const capacity: Record<string, number> = {};
  for (const slot of demand.slots) {
    capacity[slot.slot] = maxCovers;
  }

  const posture = computeServicePosture(
    demand, stressSlots, walkinPressure, bookingsPerSlot, capacity, config,
  );

  // ── Evaluate Request ──

  const existingBookings = (reservations || [])
    .filter((r) => r.status !== 'cancelled' && r.status !== 'no_show')
    .map((r) => ({
      arrival_time: r.arrival_time,
      party_size: r.party_size,
      expected_duration: r.expected_duration,
      table_ids: r.table_ids || [],
    }));

  const availableTables = tableRows.map((t) => ({
    ...t,
    is_premium: config.vip_table_ids.includes(t.id),
  }));

  const evaluation = evaluateRequest(
    posture, duration, showProb, spend, walkinSlot, config,
    { party_size, requested_time: requested_time, channel, is_vip },
    availableTables, existingBookings,
  );
  const guardrailAdjustments: string[] = [];
  const requestedSlotStress = stressSlots.find((s) => s.slot === requested_time)?.stress_score
    ?? posture.metrics.peak_stress;
  const riskBand = classifyRiskBand(requestedSlotStress, evaluation.confidence);

  if (
    evaluation.recommendation === 'deny'
    && policy.hard_constraints.vip_never_auto_deny
    && is_vip
  ) {
    evaluation.recommendation = 'waitlist';
    guardrailAdjustments.push('vip_never_auto_deny');
    evaluation.reasoning += ' Policy guardrail applied: VIP requests are never auto-denied.';
  }

  if (
    evaluation.recommendation === 'deny'
    && evaluation.confidence < policy.hard_constraints.deny_if_confidence_below
  ) {
    evaluation.recommendation = 'waitlist';
    guardrailAdjustments.push('deny_if_confidence_below');
    evaluation.reasoning += ` Policy guardrail applied: deny confidence (${evaluation.confidence.toFixed(2)}) below threshold (${policy.hard_constraints.deny_if_confidence_below}).`;
  }

  if (
    evaluation.recommendation === 'accept'
    && requestedSlotStress > policy.hard_constraints.stress_score_max
  ) {
    evaluation.recommendation = 'waitlist';
    guardrailAdjustments.push('stress_score_max');
    evaluation.reasoning += ` Policy guardrail applied: slot stress (${requestedSlotStress}) exceeded max (${policy.hard_constraints.stress_score_max}).`;
  }

  const autoExecuteEligible = shouldAutoExecute(
    policy.automation_tiers.active_tier,
    evaluation.recommendation,
    riskBand,
  );

  // ── AI-enhanced reasoning ──
  const aiReasoning = await generateDecisionReasoning(evaluation, forecastCtx);
  if (aiReasoning) evaluation.reasoning = aiReasoning;

  // ── Log decision ──
  try {
    await logYieldDecision({
      org_id: orgId,
      venue_id,
      business_date: date,
      decision_type: 'evaluate',
      recommendation: evaluation.recommendation,
      confidence: evaluation.confidence,
      reasoning: evaluation.reasoning,
      payload: {
        party_size,
        requested_time,
        channel,
        is_vip,
        accept_value: evaluation.accept_value,
        hold_value: evaluation.hold_value,
        posture: posture.posture,
        predictions: evaluation.predictions,
        policy: {
          version: policy.policy_version,
          active_tier: policy.automation_tiers.active_tier,
          risk_band: riskBand,
          auto_execute_eligible: autoExecuteEligible,
          guardrail_adjustments: guardrailAdjustments,
          validation_ok: policyValidation.valid,
        },
      },
    });
  } catch (err) {
    console.error('[rez-yield] Failed to log decision:', err);
  }

  return NextResponse.json({
    ...evaluation,
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
      risk_band: riskBand,
      auto_execute_eligible: autoExecuteEligible,
      guardrail_adjustments: guardrailAdjustments,
      validation_ok: policyValidation.valid,
      validation_errors: policyValidation.errors,
    },
    elapsed_ms: Date.now() - t0,
  });
}
