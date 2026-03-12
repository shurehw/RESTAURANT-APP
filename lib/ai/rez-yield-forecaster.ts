/**
 * Rez Yield Engine — Forecasting Layer
 *
 * Six prediction models, all actuals-calibrated statistical models
 * enhanced by Claude for edge cases and explanation.
 *
 * Models:
 *   1. Demand forecast (extends existing demand_forecasts)
 *   2. Dining duration prediction
 *   3. Show / no-show / cancel probability
 *   4. Spend / value prediction
 *   5. Walk-in pressure forecast
 *   6. Pacing / stress forecast
 */

import Anthropic from '@anthropic-ai/sdk';
import { predictDuration, getSlotDemandMetrics, getPickupPace } from '@/lib/database/rez-yield-metrics';

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ──────────────────────────────────────────────────

export interface ForecastContext {
  venue_id: string;
  venue_name: string;
  business_date: string;
  day_of_week: number;      // 0-6
  shift_type: string;
  current_time?: string;     // HH:MM, for real-time updates
  is_event_night: boolean;
  is_holiday: boolean;
  weather?: { temp_high: number; conditions: string };
  patio_open?: boolean;
  /** Pre-computed demand modifier from demand_calendar table. When present,
   *  replaces the blunt is_event_night / is_holiday multipliers. */
  demand_modifier?: {
    multiplier: number;
    narrative: string | null;
    confidence: 'high' | 'medium' | 'low';
    is_quiet_period: boolean;
    open_pacing_recommended: boolean;
    lookahead_extension_days: number;
    holiday_name: string | null;
    has_private_event: boolean;
    private_event_is_buyout: boolean;
  };
}

export interface SlotForecast {
  slot: string;                // "17:00"
  expected_requests: number;
  expected_bookings: number;
  fill_probability: number;    // 0-1
  walkin_pressure: number;     // 0-100
  party_size_distribution: Record<string, number>;  // bucket → expected count
}

export interface DemandForecastOutput {
  service_level: {
    expected_total_covers: number;
    expected_total_requests: number;
    covers_p10: number;
    covers_p90: number;
    sellout_probability: number;
    walk_in_expected: number;
  };
  slots: SlotForecast[];
  pickup_pace_ratio: number;    // >1 = ahead of pace
  demand_strength: 'weak' | 'moderate' | 'strong' | 'very_strong';
}

export interface DurationPrediction {
  party_size: number;
  predicted_mins: number;      // p50
  p25_mins: number;
  p75_mins: number;
  p90_mins: number;
  confidence: 'high' | 'medium' | 'low';
  source: string;              // which cohort was used
  adjustments: string[];       // e.g., "VIP +15%", "event night +10%"
}

export interface ShowProbability {
  show: number;
  late: number;
  cancel: number;
  no_show: number;
  confidence: 'high' | 'medium' | 'low';
  factors: string[];
}

export interface SpendPrediction {
  expected_revenue: number;
  expected_bev_pct: number;
  confidence: 'high' | 'medium' | 'low';
  comparable_avg: number;      // avg spend for similar parties/slots
}

export interface WalkinPressure {
  slot: string;
  expected_walkins: number;
  conversion_rate: number;
  expected_spend_per_walkin: number;
  pressure_score: number;     // 0-100
}

export interface StressForecast {
  slot: string;
  stress_score: number;       // 0-100
  arrival_burst_score: number;
  kitchen_risk: number;       // 0-100
  foh_congestion: number;     // 0-100
  factors: string[];
}

// ── Model 1: Demand Forecast ───────────────────────────────

/**
 * Predict demand by service, slot, and party size.
 * Builds on existing demand_forecasts + demand_distribution_curves.
 */
export async function forecastDemand(
  ctx: ForecastContext,
  existingForecast: { covers_predicted: number; revenue_predicted: number; walkin_covers_predicted: number | null } | null,
  slotDemand: Awaited<ReturnType<typeof getSlotDemandMetrics>>,
  pickupPace: Awaited<ReturnType<typeof getPickupPace>>,
): Promise<DemandForecastOutput> {
  const baseForecast = existingForecast?.covers_predicted || 0;
  const walkinForecast = existingForecast?.walkin_covers_predicted || Math.round(baseForecast * 0.15);

  // Compute pickup pace ratio from recent snapshots
  const recentPace = pickupPace.find((p) => p.hours_out <= 24);
  const paceRatio = recentPace?.pace_ratio || 1.0;

  // Adjust base forecast by pickup pace
  const adjustedCovers = Math.round(baseForecast * Math.max(0.7, Math.min(1.3, paceRatio)));

  // Determine demand strength
  let strength: DemandForecastOutput['demand_strength'] = 'moderate';
  if (paceRatio < 0.75) strength = 'weak';
  else if (paceRatio > 1.35) strength = 'very_strong';
  else if (paceRatio > 1.15) strength = 'strong';

  // Demand modifier: use pre-computed calendar entry when available,
  // otherwise fall back to blunt is_event_night / is_holiday flags.
  let eventMultiplier: number;
  if (ctx.demand_modifier) {
    eventMultiplier = ctx.demand_modifier.multiplier;
  } else {
    eventMultiplier = 1.0;
    if (ctx.is_event_night) eventMultiplier *= 1.15;
    if (ctx.is_holiday) eventMultiplier *= 1.1;
  }

  const finalCovers = Math.round(adjustedCovers * eventMultiplier);

  // Distribute across slots (use existing distribution curves or uniform)
  const slots: SlotForecast[] = [];
  const slotCount = 24; // 6pm-midnight, 15-min slots
  const startHour = ctx.shift_type === 'lunch' ? 11 : 17;

  for (let i = 0; i < slotCount; i++) {
    const hour = startHour + Math.floor(i / 4);
    const min = (i % 4) * 15;
    const slot = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

    // Use actual demand data if available, otherwise distribute evenly
    const demandSlot = slotDemand.find((d) => d.slot === slot);
    const slotRequests = demandSlot?.total_requests || Math.round(finalCovers / slotCount);
    const denialRate = demandSlot?.denial_rate || 0;

    slots.push({
      slot,
      expected_requests: slotRequests,
      expected_bookings: Math.round(slotRequests * (1 - denialRate)),
      fill_probability: Math.min(1, denialRate > 0.3 ? 0.9 : denialRate > 0.1 ? 0.7 : 0.5),
      walkin_pressure: Math.round((walkinForecast / slotCount) * (i >= 4 && i <= 16 ? 1.5 : 0.5)),
      party_size_distribution: { '1-2': 0.35, '3-4': 0.40, '5-6': 0.15, '7-8': 0.07, '9+': 0.03 },
    });
  }

  return {
    service_level: {
      expected_total_covers: finalCovers,
      expected_total_requests: Math.round(finalCovers * 1.15), // assume 15% denial/overflow
      covers_p10: Math.round(finalCovers * 0.75),
      covers_p90: Math.round(finalCovers * 1.25),
      sellout_probability: strength === 'very_strong' ? 0.8 : strength === 'strong' ? 0.5 : 0.2,
      walk_in_expected: walkinForecast,
    },
    slots,
    pickup_pace_ratio: paceRatio,
    demand_strength: strength,
  };
}

// ── Model 2: Dining Duration ───────────────────────────────

/**
 * Predict dining duration with confidence intervals.
 * Uses cohort statistics from table_seatings, with Claude for edge cases.
 */
export async function forecastDuration(
  ctx: ForecastContext,
  partySize: number,
  sectionId?: string,
  guestProfile?: { visit_count: number; avg_spend: number; vip_tier: string } | null,
  isVip?: boolean,
): Promise<DurationPrediction> {
  // Look up cohort
  const cohort = await predictDuration(
    ctx.venue_id,
    partySize,
    sectionId,
    ctx.day_of_week,
    ctx.shift_type,
  );

  if (!cohort) {
    // Fallback: standard turn time assumptions
    const defaultMins = partySize <= 2 ? 75 : partySize <= 4 ? 90 : partySize <= 6 ? 105 : 120;
    return {
      party_size: partySize,
      predicted_mins: defaultMins,
      p25_mins: Math.round(defaultMins * 0.8),
      p75_mins: Math.round(defaultMins * 1.2),
      p90_mins: Math.round(defaultMins * 1.4),
      confidence: 'low',
      source: 'default',
      adjustments: ['No historical data — using defaults'],
    };
  }

  // Start from cohort p50
  let predicted = cohort.p50;
  const adjustments: string[] = [];

  // Apply adjustments for context
  if (isVip || guestProfile?.vip_tier === 'platinum') {
    predicted = Math.round(predicted * 1.15);
    adjustments.push('VIP/Platinum +15%');
  }

  if (ctx.is_event_night) {
    predicted = Math.round(predicted * 1.1);
    adjustments.push('Event night +10%');
  }

  if (guestProfile && guestProfile.avg_spend > 400) {
    predicted = Math.round(predicted * 1.08);
    adjustments.push('High-spender +8%');
  }

  // Scale percentiles proportionally
  const scale = predicted / cohort.p50;

  return {
    party_size: partySize,
    predicted_mins: predicted,
    p25_mins: Math.round(cohort.p25 * scale),
    p75_mins: Math.round(cohort.p75 * scale),
    p90_mins: Math.round(cohort.p90 * scale),
    confidence: cohort.sample_size >= 30 ? 'high' : cohort.sample_size >= 10 ? 'medium' : 'low',
    source: cohort.source,
    adjustments,
  };
}

// ── Model 3: Show / No-Show / Cancel ───────────────────────

/**
 * Predict show probability based on guest history, channel, and context.
 */
export async function forecastShowProbability(
  ctx: ForecastContext,
  guestProfile: { no_show_rate: number; cancel_rate: number; visit_count: number; vip_tier: string } | null,
  channel: string,
  leadTimeDays: number,
  hasDeposit: boolean,
  venueNoShowRate: number,   // historical venue-wide rate
): Promise<ShowProbability> {
  const factors: string[] = [];

  // Start from venue baseline
  let noShowBase = venueNoShowRate || 0.08;
  let cancelBase = 0.12;

  // Guest history adjustments
  if (guestProfile && guestProfile.visit_count >= 3) {
    // Use guest's actual rates with Bayesian blending
    const weight = Math.min(0.8, guestProfile.visit_count / 20);
    noShowBase = noShowBase * (1 - weight) + guestProfile.no_show_rate * weight;
    cancelBase = cancelBase * (1 - weight) + guestProfile.cancel_rate * weight;

    if (guestProfile.no_show_rate > 0.2) factors.push(`Guest has ${Math.round(guestProfile.no_show_rate * 100)}% no-show history`);
    if (guestProfile.no_show_rate === 0) factors.push('Guest has never no-showed');
  }

  // Channel adjustments
  if (channel === 'phone' || channel === 'concierge') {
    noShowBase *= 0.7; // phone/concierge less likely to no-show
    factors.push('Phone/concierge booking -30% no-show risk');
  } else if (channel === 'opentable' || channel === 'resy') {
    noShowBase *= 1.2;
    factors.push('OTA channel +20% no-show risk');
  }

  // Deposit effect
  if (hasDeposit) {
    noShowBase *= 0.3;
    cancelBase *= 0.5;
    factors.push('Deposit held — significantly lower no-show/cancel risk');
  }

  // Lead time: very last-minute bookings more likely to show
  if (leadTimeDays < 1) {
    noShowBase *= 0.6;
    factors.push('Same-day booking — lower no-show risk');
  } else if (leadTimeDays > 14) {
    noShowBase *= 1.3;
    cancelBase *= 1.4;
    factors.push('Long lead time — higher cancel/no-show risk');
  }

  // VIP guests rarely no-show
  if (guestProfile?.vip_tier === 'platinum' || guestProfile?.vip_tier === 'gold') {
    noShowBase *= 0.5;
    factors.push(`${guestProfile.vip_tier} tier — lower no-show risk`);
  }

  // Weather effect (bad weather = more no-shows)
  if (ctx.weather && ctx.weather.conditions.match(/rain|storm|snow/i)) {
    noShowBase *= 1.25;
    factors.push('Bad weather +25% no-show risk');
  }

  // Clamp to reasonable bounds
  const noShow = Math.max(0.01, Math.min(0.4, noShowBase));
  const cancel = Math.max(0.02, Math.min(0.5, cancelBase));
  const lateBase = 0.15; // relatively stable
  const rawShow = 1 - noShow - cancel - lateBase;
  const show = Math.max(0.3, rawShow);

  let late = lateBase;
  let noShowOut = noShow;
  let cancelOut = cancel;

  // If show floor is applied, rebalance the non-show buckets to keep total probability = 1.
  if (show > rawShow) {
    const remaining = 1 - show;
    const nonShowTotal = noShow + cancel + lateBase;
    if (nonShowTotal > 0) {
      const scale = remaining / nonShowTotal;
      noShowOut = noShow * scale;
      cancelOut = cancel * scale;
      late = lateBase * scale;
    }
  }

  return {
    show: Math.round(show * 1000) / 1000,
    late: Math.round(late * 1000) / 1000,
    cancel: Math.round(cancelOut * 1000) / 1000,
    no_show: Math.round(noShowOut * 1000) / 1000,
    confidence: guestProfile && guestProfile.visit_count >= 5 ? 'high' : 'medium',
    factors,
  };
}

// ── Model 4: Spend / Value ─────────────────────────────────

/**
 * Predict expected spend for a reservation.
 */
export async function forecastSpend(
  ctx: ForecastContext,
  partySize: number,
  guestProfile: { avg_spend: number; avg_party_size: number; visit_count: number } | null,
  venueAvgCheck: number,
  sectionId?: string,
): Promise<SpendPrediction> {
  // Per-cover baseline from venue
  const perCover = venueAvgCheck > 0 ? venueAvgCheck : 85; // fallback

  // Party-size adjusted (larger parties spend less per person but more total)
  const sizeFactor = partySize <= 2 ? 1.1 : partySize <= 4 ? 1.0 : partySize <= 6 ? 0.95 : 0.9;
  let expectedRevenue = perCover * partySize * sizeFactor;

  // Guest history adjustment
  if (guestProfile && guestProfile.visit_count >= 2 && guestProfile.avg_spend > 0) {
    // Blend venue avg with guest avg
    const perPersonGuest = guestProfile.avg_spend / Math.max(1, guestProfile.avg_party_size);
    const blended = perCover * 0.4 + perPersonGuest * 0.6;
    expectedRevenue = blended * partySize * sizeFactor;
  }

  // Event night premium
  if (ctx.is_event_night) {
    expectedRevenue *= 1.15;
  }

  // Weekend premium (Fri/Sat)
  if (ctx.day_of_week === 5 || ctx.day_of_week === 6) {
    expectedRevenue *= 1.08;
  }

  // Estimate beverage mix
  const bevPct = ctx.shift_type === 'late_night' ? 0.55 : ctx.shift_type === 'dinner' ? 0.38 : 0.3;

  return {
    expected_revenue: Math.round(expectedRevenue * 100) / 100,
    expected_bev_pct: bevPct,
    confidence: guestProfile && guestProfile.visit_count >= 3 ? 'high' : 'medium',
    comparable_avg: Math.round(perCover * partySize * 100) / 100,
  };
}

// ── Model 5: Walk-In Pressure ──────────────────────────────

/**
 * Predict walk-in demand by time slot.
 */
export async function forecastWalkinPressure(
  ctx: ForecastContext,
  walkinPatterns: { median_ratio: number; median_delta: number } | null,
  totalBookedCovers: number,
): Promise<WalkinPressure[]> {
  const baseWalkins = walkinPatterns
    ? Math.round(totalBookedCovers * walkinPatterns.median_ratio)
    : Math.round(totalBookedCovers * 0.12);

  // Distribute walk-ins across service (peak around 7-9pm for dinner)
  const startHour = ctx.shift_type === 'lunch' ? 11 : 17;
  const slots: WalkinPressure[] = [];

  // Walk-in distribution curve: peaks around 1.5-2.5 hours after service start
  const peakOffset = ctx.shift_type === 'dinner' ? 2 : 1;

  for (let i = 0; i < 24; i++) {
    const hour = startHour + Math.floor(i / 4);
    const min = (i % 4) * 15;
    const slot = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

    // Gaussian-ish distribution centered on peak
    const hoursFromStart = i / 4;
    const distFromPeak = Math.abs(hoursFromStart - peakOffset);
    const weight = Math.exp(-0.5 * distFromPeak * distFromPeak);

    const expectedInSlot = Math.round(baseWalkins * weight * 0.15 * 10) / 10;

    // Weekend/holiday boost
    let pressureMultiplier = 1.0;
    if (ctx.day_of_week === 5 || ctx.day_of_week === 6) pressureMultiplier = 1.4;
    if (ctx.is_holiday) pressureMultiplier *= 1.3;
    if (ctx.weather?.conditions.match(/rain|storm|snow/i)) pressureMultiplier *= 0.6;

    slots.push({
      slot,
      expected_walkins: Math.round(expectedInSlot * pressureMultiplier * 10) / 10,
      conversion_rate: 0.65, // ~65% of walk-ins who wait get seated
      expected_spend_per_walkin: 75, // walk-ins spend slightly less on average
      pressure_score: Math.min(100, Math.round(expectedInSlot * pressureMultiplier * 15)),
    });
  }

  return slots;
}

// ── Model 6: Pacing / Stress ───────────────────────────────

/**
 * Predict service stress by 15-minute interval.
 */
export async function forecastStress(
  ctx: ForecastContext,
  bookingsPerSlot: Record<string, number>,
  maxCoversPerSlot: number,
  avgDurationMins: number,
  totalTables: number,
): Promise<StressForecast[]> {
  const slots: StressForecast[] = [];
  const startHour = ctx.shift_type === 'lunch' ? 11 : 17;

  // Simulated occupancy tracker
  let runningOccupancy = 0;
  const slotsPerTurn = Math.ceil(avgDurationMins / 15);

  for (let i = 0; i < 24; i++) {
    const hour = startHour + Math.floor(i / 4);
    const min = (i % 4) * 15;
    const slot = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

    const arrivalsInSlot = bookingsPerSlot[slot] || 0;

    // Simple decay: parties from N slots ago are clearing
    if (i >= slotsPerTurn) {
      const clearingSlotKey = (() => {
        const ci = i - slotsPerTurn;
        const ch = startHour + Math.floor(ci / 4);
        const cm = (ci % 4) * 15;
        return `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`;
      })();
      runningOccupancy -= (bookingsPerSlot[clearingSlotKey] || 0);
    }
    runningOccupancy += arrivalsInSlot;
    runningOccupancy = Math.max(0, runningOccupancy);

    // Utilization-based stress
    const utilization = totalTables > 0 ? runningOccupancy / totalTables : 0;
    const pacingRatio = maxCoversPerSlot > 0 ? arrivalsInSlot / maxCoversPerSlot : 0;

    // Arrival burst: high arrivals in single slot
    const burstScore = Math.min(100, Math.round(pacingRatio * 80));

    // Kitchen stress: function of total occupancy + arrival burst
    const kitchenRisk = Math.min(100, Math.round(utilization * 60 + burstScore * 0.3));

    // FOH congestion
    const fohCongestion = Math.min(100, Math.round(utilization * 70 + burstScore * 0.2));

    // Overall stress composite
    const stressScore = Math.min(100, Math.round(
      kitchenRisk * 0.4 + fohCongestion * 0.3 + burstScore * 0.3,
    ));

    const factors: string[] = [];
    if (burstScore > 60) factors.push(`High arrival burst (${arrivalsInSlot} covers in slot)`);
    if (utilization > 0.85) factors.push(`Near-full occupancy (${Math.round(utilization * 100)}%)`);
    if (kitchenRisk > 70) factors.push('Elevated kitchen load');

    slots.push({
      slot,
      stress_score: stressScore,
      arrival_burst_score: burstScore,
      kitchen_risk: kitchenRisk,
      foh_congestion: fohCongestion,
      factors,
    });
  }

  return slots;
}

// ── Claude Enhancement ─────────────────────────────────────

/**
 * Use Claude to add qualitative context to forecasts.
 * Called optionally when edge cases exist (event nights, weather, anomalies).
 */
export async function enhanceForecastWithAI(
  ctx: ForecastContext,
  demandForecast: DemandForecastOutput,
  stressSlots: StressForecast[],
): Promise<{ insights: string[]; risk_flags: string[]; opportunities: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { insights: [], risk_flags: [], opportunities: [] };
  }

  const highStressSlots = stressSlots.filter((s) => s.stress_score > 60);
  const prompt = `You are a restaurant reservations analyst. Given the forecast data below, provide brief tactical insights.

VENUE: ${ctx.venue_name}
DATE: ${ctx.business_date} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][ctx.day_of_week]})
SHIFT: ${ctx.shift_type}
EVENT NIGHT: ${ctx.is_event_night}
HOLIDAY: ${ctx.is_holiday}
WEATHER: ${ctx.weather?.conditions || 'unknown'} (${ctx.weather?.temp_high || '?'}°F)

DEMAND STRENGTH: ${demandForecast.demand_strength}
PICKUP PACE: ${Math.round(demandForecast.pickup_pace_ratio * 100)}% of historical
EXPECTED COVERS: ${demandForecast.service_level.expected_total_covers}
WALK-IN EXPECTED: ${demandForecast.service_level.walk_in_expected}
SELLOUT PROBABILITY: ${Math.round(demandForecast.service_level.sellout_probability * 100)}%

HIGH-STRESS SLOTS: ${highStressSlots.map((s) => `${s.slot} (stress=${s.stress_score})`).join(', ') || 'none'}

Return JSON only:
{
  "insights": ["1-2 sentence tactical observations"],
  "risk_flags": ["specific risks to watch"],
  "opportunities": ["revenue optimization opportunities"]
}`;

  try {
    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return { insights: [], risk_flags: [], opportunities: [] };

    let raw = text.text.trim();
    if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(raw);
  } catch {
    return { insights: [], risk_flags: [], opportunities: [] };
  }
}
