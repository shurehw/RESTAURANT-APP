/**
 * Rez Yield Engine — Policy Engine
 *
 * Turns predictions into demand posture and accept/hold decisions.
 * This is the actual brain of the yield management system.
 *
 * Responsibilities:
 *   - Compute service-level demand posture
 *   - Compute slot-level protection scores
 *   - Evaluate inbound requests (accept / alternate / waitlist / deny)
 *   - Score table assignments for optimal fit
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  DemandForecastOutput,
  DurationPrediction,
  ShowProbability,
  SpendPrediction,
  StressForecast,
  WalkinPressure,
  ForecastContext,
} from './rez-yield-forecaster';
import type { RezYieldConfig } from '@/lib/database/rez-yield-config';

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ──────────────────────────────────────────────────

export type DemandPosture = 'aggressive' | 'open' | 'balanced' | 'protected' | 'highly_protected';

export interface SlotProtection {
  slot: string;
  protection_score: number;       // 0-100: how much to hold inventory
  aggressiveness_score: number;    // 0-100: inverse of protection
  fill_risk_score: number;         // 0-100: risk slot stays underutilized
  future_opportunity_score: number; // 0-100: expected value of holding
  recommended_action: 'release' | 'hold' | 'protect' | 'close';
  stress_score: number;
}

export interface ServicePosture {
  posture: DemandPosture;
  confidence: 'high' | 'medium' | 'low';
  slots: SlotProtection[];
  summary: string;
  metrics: {
    pickup_vs_pace: number;
    fill_pct: number;
    denied_demand_ratio: number;
    walk_in_pressure: number;
    peak_stress: number;
  };
}

export interface RequestEvaluation {
  recommendation: 'accept' | 'offer_alternate' | 'waitlist' | 'deny';
  confidence: number;           // 0-1
  reasoning: string;
  accept_value: number;         // $ value of accepting
  hold_value: number;           // $ value of holding
  value_delta: number;          // accept - hold
  alternatives: Array<{
    time: string;
    score: number;
    reason: string;
  }>;
  predictions: {
    duration: DurationPrediction;
    show_probability: ShowProbability;
    spend: SpendPrediction;
    blocking_impact: {
      tables_blocked: number;
      future_value_at_risk: number;
      dead_gap_minutes: number;
      second_turn_lost: boolean;
    };
  };
  table_recommendations: Array<{
    table_id: string;
    table_number: string;
    fit_score: number;
    reason: string;
  }>;
  posture_context: {
    posture: DemandPosture;
    slot_protection: number;
    demand_strength: string;
  };
}

export interface TableFitScore {
  table_id: string;
  table_number: string;
  score: number;            // 0-1
  reasons: string[];
  penalties: string[];
  capacity_fit: number;     // 0-1
  premium_penalty: number;  // 0-1 (higher = more penalty for using premium table)
  flexibility_cost: number; // 0-1 (higher = more flexibility lost)
}

// ── Service Posture Computation ────────────────────────────

/**
 * Compute the overall demand posture and per-slot protection scores.
 */
export function computeServicePosture(
  demand: DemandForecastOutput,
  stress: StressForecast[],
  walkin: WalkinPressure[],
  currentBookings: Record<string, number>,  // slot → covers booked
  capacity: Record<string, number>,          // slot → max capacity
  config: RezYieldConfig,
): ServicePosture {
  // ── Service-level posture ──

  const paceRatio = demand.pickup_pace_ratio;
  const selloutProb = demand.service_level.sellout_probability;

  // Total fill percentage
  const totalBooked = Object.values(currentBookings).reduce((s, v) => s + v, 0);
  const totalCapacity = Object.values(capacity).reduce((s, v) => s + v, 0);
  const fillPct = totalCapacity > 0 ? totalBooked / totalCapacity : 0;

  // Peak stress
  const peakStress = Math.max(0, ...stress.map((s) => s.stress_score));

  // Total walk-in pressure
  const totalWalkinPressure = walkin.reduce((s, w) => s + w.pressure_score, 0) / Math.max(1, walkin.length);

  // Denied demand (from demand forecast)
  const deniedRatio = demand.service_level.expected_total_requests > 0
    ? (demand.service_level.expected_total_requests - demand.service_level.expected_total_covers) / demand.service_level.expected_total_requests
    : 0;

  // Posture determination
  let posture: DemandPosture;
  if (paceRatio < 0.65 && fillPct < 0.4) {
    posture = 'aggressive';
  } else if (paceRatio < 0.85 && fillPct < 0.6) {
    posture = 'open';
  } else if (paceRatio < 1.1 && selloutProb < 0.5) {
    posture = 'balanced';
  } else if (paceRatio < 1.3 || selloutProb < 0.75) {
    posture = 'protected';
  } else {
    posture = 'highly_protected';
  }

  // Apply aggressiveness ceiling from config
  const aggCeiling = config.aggressiveness_ceiling;
  if (aggCeiling < 30 && posture === 'aggressive') posture = 'open';
  if (aggCeiling > 80 && posture === 'protected') posture = 'balanced';

  // ── Slot-level protection scores ──

  const slots: SlotProtection[] = [];

  for (const slotForecast of demand.slots) {
    const slot = slotForecast.slot;
    const booked = currentBookings[slot] || 0;
    const cap = capacity[slot] || 20;
    const slotFill = cap > 0 ? booked / cap : 0;
    const slotStress = stress.find((s) => s.slot === slot)?.stress_score || 0;
    const slotWalkin = walkin.find((w) => w.slot === slot)?.pressure_score || 0;

    // Fill risk: how likely is this slot to remain underutilized?
    const fillRisk = Math.max(0, Math.min(100, Math.round(
      (1 - slotFill) * 60 +
      (1 - slotForecast.fill_probability) * 30 +
      (paceRatio < 0.8 ? 10 : 0),
    )));

    // Future opportunity: expected value of holding this slot for better bookings
    const futureOpp = Math.max(0, Math.min(100, Math.round(
      slotForecast.fill_probability * 40 +
      (deniedRatio > 0.15 ? 30 : deniedRatio > 0.05 ? 15 : 0) +
      slotWalkin * 0.3,
    )));

    // Protection score: composite
    const protection = Math.max(0, Math.min(100, Math.round(
      futureOpp * 0.5 +
      slotFill * 30 +       // already-full slots need protection
      slotStress * 0.2 -    // high stress = protect service quality
      fillRisk * 0.3,       // high fill risk = less protection needed
    )));

    // Recommended action
    let action: SlotProtection['recommended_action'];
    if (protection > 80) action = 'protect';
    else if (protection > 50) action = 'hold';
    else if (fillRisk > 60) action = 'release';
    else action = 'hold';

    // If service stress is extreme, close the slot
    if (slotStress > config.max_stress_score) action = 'close';

    slots.push({
      slot,
      protection_score: protection,
      aggressiveness_score: 100 - protection,
      fill_risk_score: fillRisk,
      future_opportunity_score: futureOpp,
      recommended_action: action,
      stress_score: slotStress,
    });
  }

  // Build summary
  const protectedSlots = slots.filter((s) => s.protection_score > 60).length;
  const aggressiveSlots = slots.filter((s) => s.aggressiveness_score > 60).length;
  const summary = `${posture.replace('_', ' ')} posture. ${Math.round(fillPct * 100)}% filled. ${protectedSlots} slots protected, ${aggressiveSlots} slots aggressive. Pickup at ${Math.round(paceRatio * 100)}% of historical pace.`;

  return {
    posture,
    confidence: demand.service_level.expected_total_covers > 0 ? 'high' : 'low',
    slots,
    summary,
    metrics: {
      pickup_vs_pace: paceRatio,
      fill_pct: fillPct,
      denied_demand_ratio: deniedRatio,
      walk_in_pressure: totalWalkinPressure,
      peak_stress: peakStress,
    },
  };
}

// ── Request Evaluation ─────────────────────────────────────

/**
 * Evaluate an inbound reservation request.
 * Core decision: accept at requested time, offer alternatives, waitlist, or deny.
 */
export function evaluateRequest(
  posture: ServicePosture,
  duration: DurationPrediction,
  showProb: ShowProbability,
  spend: SpendPrediction,
  walkinSlot: WalkinPressure | null,
  config: RezYieldConfig,
  request: {
    party_size: number;
    requested_time: string;
    channel: string;
    is_vip: boolean;
  },
  availableTables: Array<{
    id: string;
    table_number: string;
    min_capacity: number;
    max_capacity: number;
    section_id: string | null;
    shape: string;
    is_premium?: boolean;
  }>,
  existingBookings: Array<{
    arrival_time: string;
    party_size: number;
    expected_duration: number;
    table_ids: string[];
  }>,
): RequestEvaluation {
  const slotProtection = posture.slots.find((s) => s.slot === request.requested_time);
  const protectionScore = slotProtection?.protection_score || 50;

  // ── Accept Value ──
  const expectedRevenue = spend.expected_revenue * showProb.show;
  const secondTurnValue = estimateSecondTurnValue(
    request.requested_time, duration, existingBookings, spend,
  );
  const alternatives = findAlternativeSlots(request, posture, duration, spend, existingBookings);
  const guestRelationshipValue = request.is_vip ? 50 : 0;
  const pacingFitValue = slotProtection?.stress_score
    ? Math.max(0, (100 - slotProtection.stress_score) * 0.5)
    : 25;

  const noShowCost = spend.expected_revenue * showProb.no_show * 0.8; // lost opportunity cost
  const blockingImpact = computeBlockingImpact(
    request, duration, availableTables, existingBookings, config,
  );
  const futureOppCost = (slotProtection?.future_opportunity_score || 0) * 2;
  const stressCost = (slotProtection?.stress_score || 0) * 0.5;

  const acceptValue = expectedRevenue + secondTurnValue + guestRelationshipValue + pacingFitValue
    - noShowCost - blockingImpact.future_value_at_risk * 0.3 - futureOppCost - stressCost;

  // ── Hold Value ──
  const futureBookingValue = (slotProtection?.future_opportunity_score || 0) * 3;
  const walkinReserveValue = (walkinSlot?.pressure_score || 0) * 1.5;
  const vipDemandValue = posture.posture === 'protected' || posture.posture === 'highly_protected' ? 30 : 0;
  const underfillCost = (slotProtection?.fill_risk_score || 50) * 2;

  const holdValue = futureBookingValue + walkinReserveValue + vipDemandValue - underfillCost;

  const valueDelta = acceptValue - holdValue;

  // ── Decision ──
  let recommendation: RequestEvaluation['recommendation'];
  let reasoning: string;

  // VIP override: always accept if tables available
  if (request.is_vip && availableTables.length > 0) {
    recommendation = 'accept';
    reasoning = 'VIP guest — priority acceptance.';
  }
  // Strong accept signal
  else if (valueDelta > 50 || posture.posture === 'aggressive' || posture.posture === 'open') {
    recommendation = 'accept';
    reasoning = `Accept value ($${Math.round(acceptValue)}) significantly exceeds hold value ($${Math.round(holdValue)}). ${posture.posture} posture.`;
  }
  // Marginal — offer alternates if available
  else if (valueDelta > -20 && valueDelta <= 50) {
    if (alternatives.length > 0) {
      recommendation = 'offer_alternate';
      reasoning = `Requested slot has ${protectionScore}% protection. Better value at alternate times. Dead gap of ${blockingImpact.dead_gap_minutes} min.`;
    } else {
      recommendation = 'accept';
      reasoning = `Marginal value delta ($${Math.round(valueDelta)}) but no better alternatives available.`;
    }
  }
  // Stress overload
  else if ((slotProtection?.stress_score || 0) > config.max_stress_score) {
    recommendation = 'waitlist';
    reasoning = `Service stress (${slotProtection?.stress_score}) exceeds threshold (${config.max_stress_score}). Waitlist to protect service quality.`;
  }
  // Negative value — deny or waitlist
  else {
    recommendation = valueDelta < -80 ? 'deny' : 'waitlist';
    reasoning = `Hold value ($${Math.round(holdValue)}) exceeds accept value ($${Math.round(acceptValue)}). ${posture.posture} posture, protection at ${protectionScore}%.`;
  }

  // Score tables
  const tableRecs = scoreTableFit(request, availableTables, duration, posture, config);
  const tableRecommendations = tableRecs.slice(0, 3).map((rec) => ({
    table_id: rec.table_id,
    table_number: rec.table_number,
    fit_score: rec.score,
    reason: [...rec.reasons, ...rec.penalties.map((p) => `Penalty: ${p}`)].join('; ') || 'Best overall fit',
  }));

  return {
    recommendation,
    confidence: Math.min(1, Math.max(0, Math.abs(valueDelta) / 150)),
    reasoning,
    accept_value: Math.round(acceptValue),
    hold_value: Math.round(holdValue),
    value_delta: Math.round(valueDelta),
    alternatives: recommendation === 'offer_alternate' ? alternatives : [],
    predictions: {
      duration,
      show_probability: showProb,
      spend,
      blocking_impact: blockingImpact,
    },
    table_recommendations: tableRecommendations,
    posture_context: {
      posture: posture.posture,
      slot_protection: protectionScore,
      demand_strength: posture.metrics.pickup_vs_pace > 1.15 ? 'strong' : posture.metrics.pickup_vs_pace > 0.85 ? 'moderate' : 'weak',
    },
  };
}

// ── Blocking Impact Analysis ───────────────────────────────

function computeBlockingImpact(
  request: { party_size: number; requested_time: string },
  duration: DurationPrediction,
  tables: Array<{ id: string; min_capacity: number; max_capacity: number }>,
  existingBookings: Array<{ arrival_time: string; expected_duration: number; table_ids: string[] }>,
  config: RezYieldConfig,
): { tables_blocked: number; future_value_at_risk: number; dead_gap_minutes: number; second_turn_lost: boolean } {
  // Find candidate tables
  const fittingTables = tables.filter(
    (t) => t.max_capacity >= request.party_size && t.min_capacity <= request.party_size,
  );

  // Check if any are over-sized (blocking larger parties later)
  const oversizedBlocked = fittingTables.filter(
    (t) => config.protect_large_tops && t.max_capacity >= config.large_top_threshold && request.party_size < t.max_capacity - 1,
  );

  // Estimate dead gap
  const requestHour = parseInt(request.requested_time.split(':')[0]);
  const requestMin = parseInt(request.requested_time.split(':')[1]);
  const seatingEnd = requestHour * 60 + requestMin + duration.p75_mins;
  const serviceEndMin = 23 * 60 + 30; // 11:30 PM

  // Is there enough time for a second turn?
  const remainingAfterClear = serviceEndMin - seatingEnd - config.turn_buffer_minutes;
  const secondTurnLost = remainingAfterClear < 60; // not enough for a reasonable second turn

  // Dead gap: time between this seating clearing and next logical seating
  const nextBookingAfter = existingBookings
    .filter((b) => {
      const bHour = parseInt(b.arrival_time.split(':')[0]);
      const bMin = parseInt(b.arrival_time.split(':')[1]);
      return bHour * 60 + bMin > seatingEnd;
    })
    .sort((a, b) => {
      const aMins = parseInt(a.arrival_time.split(':')[0]) * 60 + parseInt(a.arrival_time.split(':')[1]);
      const bMins = parseInt(b.arrival_time.split(':')[0]) * 60 + parseInt(b.arrival_time.split(':')[1]);
      return aMins - bMins;
    })[0];

  let deadGap = 0;
  if (nextBookingAfter) {
    const nextMins = parseInt(nextBookingAfter.arrival_time.split(':')[0]) * 60
      + parseInt(nextBookingAfter.arrival_time.split(':')[1]);
    deadGap = Math.max(0, nextMins - seatingEnd - config.turn_buffer_minutes);
  }

  return {
    tables_blocked: oversizedBlocked.length,
    future_value_at_risk: oversizedBlocked.length * 120, // rough estimate per blocked table
    dead_gap_minutes: deadGap,
    second_turn_lost: secondTurnLost,
  };
}

// ── Second Turn Value Estimation ───────────────────────────

function estimateSecondTurnValue(
  requestedTime: string,
  duration: DurationPrediction,
  existingBookings: Array<{ arrival_time: string; expected_duration: number }>,
  spend: SpendPrediction,
): number {
  const reqHour = parseInt(requestedTime.split(':')[0]);
  const reqMin = parseInt(requestedTime.split(':')[1]);
  const clearTime = reqHour * 60 + reqMin + duration.predicted_mins + 15; // +15 buffer

  // Can a second turn fit?
  const serviceEnd = 23 * 60 + 30;
  const availableForSecondTurn = serviceEnd - clearTime;

  if (availableForSecondTurn < 75) return 0; // not enough time

  // Estimate likelihood of a second-turn booking
  const secondTurnProb = availableForSecondTurn > 120 ? 0.7 : availableForSecondTurn > 90 ? 0.5 : 0.3;

  // Value = probability × estimated revenue of second turn (smaller party, shorter stay)
  return Math.round(secondTurnProb * spend.comparable_avg * 0.8);
}

// ── Alternative Slot Finder ────────────────────────────────

function findAlternativeSlots(
  request: { party_size: number; requested_time: string },
  posture: ServicePosture,
  duration: DurationPrediction,
  spend: SpendPrediction,
  existingBookings: Array<{ arrival_time: string; expected_duration: number }>,
): Array<{ time: string; score: number; reason: string }> {
  const alternatives: Array<{ time: string; score: number; reason: string }> = [];
  const reqHour = parseInt(request.requested_time.split(':')[0]);
  const reqMin = parseInt(request.requested_time.split(':')[1]);
  const reqTotalMin = reqHour * 60 + reqMin;

  // Check nearby slots (within 90 minutes)
  for (const slot of posture.slots) {
    const slotHour = parseInt(slot.slot.split(':')[0]);
    const slotMin = parseInt(slot.slot.split(':')[1]);
    const slotTotalMin = slotHour * 60 + slotMin;
    const diff = Math.abs(slotTotalMin - reqTotalMin);

    // Skip requested time and slots too far away
    if (diff === 0 || diff > 90) continue;

    // Score: lower protection + closer time = better
    const protectionPenalty = slot.protection_score / 100;
    const distancePenalty = diff / 120;
    const stressPenalty = slot.stress_score / 200;
    const score = Math.max(0, Math.min(1,
      1 - protectionPenalty * 0.5 - distancePenalty * 0.3 - stressPenalty * 0.2,
    ));

    if (score < 0.3) continue; // not worth offering

    let reason = '';
    if (slot.protection_score < 30) reason = 'Open slot with good availability';
    else if (slot.fill_risk_score > 50) reason = 'Needs fills — good value match';
    else reason = 'Less congested time window';

    // Check if second-turn opportunity is better
    const clearMin = slotTotalMin + duration.predicted_mins + 15;
    if (clearMin < 22 * 60 && slotTotalMin < reqTotalMin) {
      reason += '. Enables second-turn seating.';
    }

    alternatives.push({ time: slot.slot, score: Math.round(score * 100) / 100, reason });
  }

  return alternatives
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ── Table Fit Scoring ──────────────────────────────────────

/**
 * Score table fit for a party.
 * Best fit = preserves most future flexibility while serving the guest well.
 */
export function scoreTableFit(
  request: { party_size: number; requested_time: string; is_vip: boolean },
  tables: Array<{
    id: string;
    table_number: string;
    min_capacity: number;
    max_capacity: number;
    section_id: string | null;
    shape: string;
    is_premium?: boolean;
  }>,
  duration: DurationPrediction,
  posture: ServicePosture,
  config: RezYieldConfig,
): TableFitScore[] {
  const scores: TableFitScore[] = [];

  for (const table of tables) {
    const reasons: string[] = [];
    const penalties: string[] = [];

    // Capacity fit (0-1): perfect fit = max score, over-capacity = penalty
    let capacityFit: number;
    if (request.party_size < table.min_capacity) {
      capacityFit = 0; // too small for this table
      penalties.push(`Party (${request.party_size}) below table minimum (${table.min_capacity})`);
    } else if (request.party_size > table.max_capacity) {
      capacityFit = 0;
      penalties.push(`Party (${request.party_size}) exceeds table capacity (${table.max_capacity})`);
    } else if (request.party_size === table.max_capacity) {
      capacityFit = 1.0;
      reasons.push('Perfect capacity match');
    } else {
      // Smaller party on larger table: penalty proportional to waste
      const waste = table.max_capacity - request.party_size;
      capacityFit = Math.max(0.3, 1 - waste * 0.15);
      if (waste >= 2) penalties.push(`${waste} seats unused`);
    }

    // Premium penalty: don't use premium tables for non-VIP in protected posture
    let premiumPenalty = 0;
    if (table.is_premium || config.vip_table_ids.includes(table.id)) {
      if (!request.is_vip && (posture.posture === 'protected' || posture.posture === 'highly_protected')) {
        premiumPenalty = 0.6;
        penalties.push('Premium table held for VIP/high-value guests');
      } else if (request.is_vip) {
        premiumPenalty = -0.2; // bonus for VIP on premium
        reasons.push('VIP on preferred premium table');
      }
    }

    // Flexibility cost: using a large table for small party blocks future large-party bookings
    let flexibilityCost = 0;
    if (config.protect_large_tops
      && table.max_capacity >= config.large_top_threshold
      && request.party_size < table.max_capacity - 1
      && posture.posture !== 'aggressive'
    ) {
      flexibilityCost = 0.4;
      penalties.push(`Consuming ${table.max_capacity}-top capacity for ${request.party_size}-top`);
    }

    // Blocked section
    if (config.blocked_section_ids.includes(table.section_id || '')) {
      continue; // skip entirely
    }

    const totalScore = Math.max(0, Math.min(1,
      capacityFit * 0.5
      - premiumPenalty * 0.25
      - flexibilityCost * 0.25,
    ));

    scores.push({
      table_id: table.id,
      table_number: table.table_number,
      score: Math.round(totalScore * 100) / 100,
      reasons,
      penalties,
      capacity_fit: capacityFit,
      premium_penalty: premiumPenalty,
      flexibility_cost: flexibilityCost,
    });
  }

  return scores
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ── AI-Enhanced Reasoning ──────────────────────────────────

/**
 * Use Claude to generate human-readable reasoning for a decision.
 * Called after the statistical engine produces a recommendation.
 */
export async function generateDecisionReasoning(
  evaluation: RequestEvaluation,
  ctx: ForecastContext,
): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return evaluation.reasoning;

  const prompt = `You are a senior restaurant reservationist explaining a booking decision. Be concise (2-3 sentences max).

DECISION: ${evaluation.recommendation}
PARTY SIZE: ${evaluation.predictions.duration.party_size}
REQUESTED TIME: ${evaluation.posture_context.slot_protection > 0 ? 'protected' : 'open'} slot
POSTURE: ${evaluation.posture_context.posture}
ACCEPT VALUE: $${evaluation.accept_value}
HOLD VALUE: $${evaluation.hold_value}
DURATION PREDICTED: ${evaluation.predictions.duration.predicted_mins} min (${evaluation.predictions.duration.confidence} confidence)
SHOW PROBABILITY: ${Math.round(evaluation.predictions.show_probability.show * 100)}%
BLOCKING IMPACT: ${evaluation.predictions.blocking_impact.tables_blocked} tables blocked, ${evaluation.predictions.blocking_impact.dead_gap_minutes} min dead gap
SECOND TURN LOST: ${evaluation.predictions.blocking_impact.second_turn_lost}
${evaluation.alternatives.length > 0 ? `ALTERNATIVES: ${evaluation.alternatives.map((a) => a.time).join(', ')}` : ''}

Write a clear, actionable explanation for the host. No jargon. Focus on why this is the best decision.`;

  try {
    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content.find((b) => b.type === 'text');
    return text && text.type === 'text' ? text.text.trim() : evaluation.reasoning;
  } catch {
    return evaluation.reasoning;
  }
}
