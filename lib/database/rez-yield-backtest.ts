/**
 * Rez Yield Backtest — Counterfactual Analysis
 *
 * Replays a completed service day through the yield engine to answer:
 * "Would the engine have produced better outcomes than what actually happened?"
 *
 * Compares actual covers/revenue/utilization against what the engine
 * would have recommended for each reservation request.
 */

import { createClient } from '@supabase/supabase-js';
import { getYieldConfigOrDefault } from '@/lib/database/rez-yield-config';
import { getSlotDemandMetrics, getPickupPace } from '@/lib/database/rez-yield-metrics';
import {
  forecastDemand,
  forecastDuration,
  forecastShowProbability,
  forecastSpend,
  forecastWalkinPressure,
  forecastStress,
} from '@/lib/ai/rez-yield-forecaster';
import { computeServicePosture, evaluateRequest } from '@/lib/ai/rez-yield-policy';
import { classifyRiskBand } from '@/lib/ai/rez-agent-policy';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Types ──────────────────────────────────────────────────

export interface BacktestResult {
  org_id: string;
  venue_id: string;
  business_date: string;
  shift_type: string;
  actual_covers: number;
  actual_revenue: number;
  actual_utilization: number;
  actual_dead_gap_mins: number;
  actual_second_turns: number;
  engine_covers: number;
  engine_revenue: number;
  engine_utilization: number;
  engine_dead_gap_mins: number;
  engine_second_turns: number;
  revenue_delta: number;
  utilization_delta: number;
  covers_delta: number;
  narrative: string;
  recommendations: unknown[];
}

interface ReservationRow {
  id: string;
  party_size: number;
  arrival_time: string;
  status: string;
  channel: string | null;
  is_vip: boolean;
  actual_spend: number | null;
  expected_duration: number;
  table_ids: string[] | null;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface SeatingRow {
  duration_mins: number | null;
  actual_party_size: number | null;
  subtotal: number | null;
  seated_time: string | null;
  cleared_time: string | null;
  table_id: string;
  section_id: string | null;
}

interface TableRow {
  id: string;
  table_number: string;
  min_capacity: number;
  max_capacity: number;
  section_id: string | null;
  shape: string;
}

// ── Core Backtest ──────────────────────────────────────────

/**
 * Run a backtest for a single venue on a completed business date.
 *
 * Strategy:
 * 1. Load actual outcomes from table_seatings + reservations
 * 2. Replay each reservation through the yield engine in arrival order
 * 3. Build a counterfactual book: what the engine would have accepted/denied
 * 4. Compare counterfactual revenue & utilization vs actuals
 */
export async function runBacktest(
  orgId: string,
  venueId: string,
  date: string,
): Promise<BacktestResult | null> {
  // ── 1. Load actuals ──

  const [reservations, seatings, tables, config, venueData, dayFacts] = await Promise.all([
    loadReservations(venueId, date),
    loadSeatings(venueId, date),
    loadTables(venueId),
    getYieldConfigOrDefault(venueId),
    supabase.from('venues').select('name').eq('id', venueId).single(),
    loadAvgCheck(venueId),
  ]);

  if (reservations.length === 0 && seatings.length === 0) {
    return null; // no data to backtest — venue likely closed
  }

  const venueName = venueData.data?.name || 'Unknown';
  const avgCheck = dayFacts;
  const totalTables = tables.length || 30;

  // ── Actual metrics ──

  const actualCovers = seatings.reduce((s, r) => s + (r.actual_party_size || 0), 0)
    || reservations.filter((r) => r.status === 'completed' || r.status === 'seated')
      .reduce((s, r) => s + r.party_size, 0);

  const actualRevenue = seatings.reduce((s, r) => s + (r.subtotal || 0), 0)
    || reservations.filter((r) => r.status === 'completed' || r.status === 'seated')
      .reduce((s, r) => s + (r.actual_spend || 0), 0);

  const actualUtilization = computeUtilization(seatings, totalTables);
  const actualDeadGaps = computeDeadGapMinutes(seatings, totalTables);
  const actualSecondTurns = countSecondTurns(seatings);

  // ── 2. Build forecast context ──

  const dow = new Date(date + 'T12:00:00').getDay();
  const forecastCtx = {
    venue_id: venueId,
    venue_name: venueName,
    business_date: date,
    day_of_week: dow,
    shift_type: 'dinner',
    is_event_night: false,
    is_holiday: false,
  };

  // Load forecast inputs (these are historical, so they reflect state on that date)
  const [slotDemand, pickupPace] = await Promise.all([
    getSlotDemandMetrics(venueId, date),
    getPickupPace(venueId, date),
  ]);

  const { data: forecast } = await supabase
    .from('demand_forecasts')
    .select('covers_predicted, revenue_predicted, walkin_covers_predicted')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', 'dinner')
    .order('forecast_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 3. Run forecasting models ──

  const demand = await forecastDemand(forecastCtx, forecast, slotDemand, pickupPace);

  const walkinPressure = await forecastWalkinPressure(
    forecastCtx, null, demand.service_level.expected_total_covers,
  );

  // Build per-slot bookings from actual reservations for stress forecast
  const bookingsPerSlot: Record<string, number> = {};
  for (const rez of reservations) {
    if (rez.status === 'cancelled' || rez.status === 'no_show') continue;
    const [h, m] = (rez.arrival_time || '00:00').split(':').map(Number);
    const slotM = Math.floor(m / 15) * 15;
    const key = `${String(h).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`;
    bookingsPerSlot[key] = (bookingsPerSlot[key] || 0) + rez.party_size;
  }

  const avgDuration = seatings.length > 0
    ? seatings.reduce((s, r) => s + (r.duration_mins || 90), 0) / seatings.length
    : 90;

  const maxCoversPerSlot = Math.max(20, ...Object.values(bookingsPerSlot));

  const stressSlots = await forecastStress(
    forecastCtx, bookingsPerSlot, maxCoversPerSlot, avgDuration, totalTables,
  );

  // Compute posture
  const capacity: Record<string, number> = {};
  for (const slot of demand.slots) {
    capacity[slot.slot] = maxCoversPerSlot;
  }
  const posture = computeServicePosture(
    demand, stressSlots, walkinPressure, bookingsPerSlot, capacity, config,
  );

  // ── 4. Replay each reservation through the engine ──

  // Sort by arrival time to simulate chronological decision-making
  const sortedRezs = reservations
    .filter((r) => r.status !== 'cancelled') // include no-shows — engine didn't know at booking time
    .sort((a, b) => (a.arrival_time || '').localeCompare(b.arrival_time || ''));

  let engineCovers = 0;
  let engineRevenue = 0;
  let engineDeadGapMins = 0;
  let engineSecondTurns = 0;
  const engineAccepted: ReservationRow[] = [];
  const decisions: Array<{
    rez_id: string;
    party_size: number;
    time: string;
    actual_status: string;
    engine_rec: string;
    risk_band: string;
    accept_value: number;
    hold_value: number;
  }> = [];

  for (const rez of sortedRezs) {
    // Build the booking state as it would have been at this point
    const existingBookings = engineAccepted.map((r) => ({
      arrival_time: r.arrival_time,
      party_size: r.party_size,
      expected_duration: r.expected_duration,
      table_ids: r.table_ids || [],
    }));

    const availableTables = tables.map((t) => ({
      ...t,
      is_premium: config.vip_table_ids.includes(t.id),
    }));

    // Run duration + show + spend predictions
    const duration = await forecastDuration(
      forecastCtx, rez.party_size, undefined, null, rez.is_vip,
    );

    const showProb = await forecastShowProbability(
      forecastCtx, null, rez.channel || 'direct', 3, false, 0.08,
    );

    const spend = await forecastSpend(
      forecastCtx, rez.party_size, null, avgCheck,
    );

    const walkinSlot = walkinPressure.find((w) => w.slot === rez.arrival_time) || null;

    // Evaluate
    const evaluation = evaluateRequest(
      posture, duration, showProb, spend, walkinSlot, config,
      {
        party_size: rez.party_size,
        requested_time: rez.arrival_time,
        channel: rez.channel || 'direct',
        is_vip: rez.is_vip,
      },
      availableTables,
      existingBookings,
    );

    const slotStress = stressSlots.find((s) => s.slot === rez.arrival_time)?.stress_score
      ?? posture.metrics.peak_stress;
    const riskBand = classifyRiskBand(slotStress, evaluation.confidence);

    decisions.push({
      rez_id: rez.id,
      party_size: rez.party_size,
      time: rez.arrival_time,
      actual_status: rez.status,
      engine_rec: evaluation.recommendation,
      risk_band: riskBand,
      accept_value: evaluation.accept_value,
      hold_value: evaluation.hold_value,
    });

    // Engine accepts → count the covers & revenue
    if (evaluation.recommendation === 'accept') {
      engineAccepted.push(rez);

      // Only count if the guest actually showed (engine doesn't know, but for
      // fair comparison we use same shows/no-shows as actuals)
      if (rez.status !== 'no_show') {
        engineCovers += rez.party_size;
        engineRevenue += rez.actual_spend || spend.expected_revenue;
      }

      engineDeadGapMins += evaluation.predictions.blocking_impact.dead_gap_minutes;
      if (!evaluation.predictions.blocking_impact.second_turn_lost) {
        engineSecondTurns++;
      }
    } else if (evaluation.recommendation === 'offer_alternate') {
      // Offer-alternate: assume 60% conversion at the better time
      // Use a deterministic hash-based conversion instead of Math.random so
      // repeated backtests produce stable outputs.
      if (rez.status !== 'no_show' && deterministicAlternateConversion(rez.id, 0.6)) {
        engineCovers += rez.party_size;
        engineRevenue += rez.actual_spend || spend.expected_revenue;
        engineAccepted.push(rez);
      }
    }
    // waitlist / deny → engine would not have seated these
  }

  const engineUtilization = totalTables > 0
    ? Math.round((engineCovers / (totalTables * 2.5)) * 100) / 100 // ~2.5 turns possible
    : 0;

  // ── 5. Compute deltas ──

  const revenueDelta = Math.round((engineRevenue - actualRevenue) * 100) / 100;
  const utilizationDelta = Math.round((engineUtilization - actualUtilization) * 100) / 100;
  const coversDelta = engineCovers - actualCovers;

  // ── 6. Build narrative ──

  const accepted = decisions.filter((d) => d.engine_rec === 'accept').length;
  const alternates = decisions.filter((d) => d.engine_rec === 'offer_alternate').length;
  const waitlisted = decisions.filter((d) => d.engine_rec === 'waitlist').length;
  const denied = decisions.filter((d) => d.engine_rec === 'deny').length;
  const noShowsEngineWouldDeny = decisions.filter(
    (d) => d.actual_status === 'no_show' && (d.engine_rec === 'deny' || d.engine_rec === 'waitlist'),
  ).length;

  const narrative = [
    `Backtest for ${venueName} on ${date}:`,
    `Engine evaluated ${decisions.length} reservations.`,
    `Decisions: ${accepted} accept, ${alternates} alternate, ${waitlisted} waitlist, ${denied} deny.`,
    revenueDelta > 0
      ? `Engine would have gained $${revenueDelta.toFixed(0)} more revenue.`
      : revenueDelta < 0
        ? `Engine would have lost $${Math.abs(revenueDelta).toFixed(0)} revenue.`
        : 'Revenue parity.',
    coversDelta !== 0
      ? `Covers delta: ${coversDelta > 0 ? '+' : ''}${coversDelta}.`
      : '',
    noShowsEngineWouldDeny > 0
      ? `Engine would have caught ${noShowsEngineWouldDeny} no-show(s) pre-service.`
      : '',
  ].filter(Boolean).join(' ');

  // Recommendations based on patterns
  const recommendations: Array<{ type: string; detail: string }> = [];

  if (denied > decisions.length * 0.3) {
    recommendations.push({
      type: 'review_thresholds',
      detail: `Engine denied ${denied}/${decisions.length} requests (${Math.round(denied / decisions.length * 100)}%). Consider loosening protection thresholds.`,
    });
  }

  if (noShowsEngineWouldDeny > 0) {
    recommendations.push({
      type: 'no_show_prevention',
      detail: `Engine identified ${noShowsEngineWouldDeny} high-risk reservation(s) that no-showed. Deposit policy or confirmation protocol could recover this.`,
    });
  }

  if (revenueDelta > 100) {
    recommendations.push({
      type: 'tier_upgrade',
      detail: `Consistent positive delta ($${revenueDelta.toFixed(0)}) suggests readiness for Tier 1 low-risk auto-actions.`,
    });
  }

  return {
    org_id: orgId,
    venue_id: venueId,
    business_date: date,
    shift_type: 'dinner',
    actual_covers: actualCovers,
    actual_revenue: Math.round(actualRevenue * 100) / 100,
    actual_utilization: actualUtilization,
    actual_dead_gap_mins: actualDeadGaps,
    actual_second_turns: actualSecondTurns,
    engine_covers: engineCovers,
    engine_revenue: Math.round(engineRevenue * 100) / 100,
    engine_utilization: engineUtilization,
    engine_dead_gap_mins: engineDeadGapMins,
    engine_second_turns: engineSecondTurns,
    revenue_delta: revenueDelta,
    utilization_delta: utilizationDelta,
    covers_delta: coversDelta,
    narrative,
    recommendations,
  };
}

/**
 * Persist a backtest result to the rez_yield_backtests table.
 */
export async function saveBacktestResult(result: BacktestResult): Promise<void> {
  const { error } = await (supabase as any)
    .from('rez_yield_backtests')
    .upsert(
      {
        ...result,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id,business_date,shift_type' },
    );

  if (error) throw new Error(`Failed to save backtest: ${error.message}`);
}

// ── Helpers ────────────────────────────────────────────────

async function loadReservations(venueId: string, date: string): Promise<ReservationRow[]> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, party_size, arrival_time, status, channel, is_vip, actual_spend, expected_duration, table_ids, email, phone, first_name, last_name')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('arrival_time', { ascending: true });

  if (error) throw new Error(`Failed to load reservations: ${error.message}`);
  return (data || []) as ReservationRow[];
}

async function loadSeatings(venueId: string, date: string): Promise<SeatingRow[]> {
  const { data, error } = await supabase
    .from('table_seatings')
    .select('duration_mins, actual_party_size, subtotal, seated_time, cleared_time, table_id, section_id')
    .eq('venue_id', venueId)
    .eq('business_date', date);

  if (error) throw new Error(`Failed to load seatings: ${error.message}`);
  return (data || []) as SeatingRow[];
}

async function loadTables(venueId: string): Promise<TableRow[]> {
  const { data, error } = await supabase
    .from('venue_tables')
    .select('id, table_number, min_capacity, max_capacity, section_id, shape')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) throw new Error(`Failed to load tables: ${error.message}`);
  return (data || []) as TableRow[];
}

async function loadAvgCheck(venueId: string): Promise<number> {
  const { data } = await supabase
    .from('venue_day_facts')
    .select('avg_check')
    .eq('venue_id', venueId)
    .order('business_date', { ascending: false })
    .limit(30);

  const rows = (data || []) as Array<{ avg_check: number | null }>;
  if (rows.length === 0) return 85;
  return rows.reduce((s, d) => s + (d.avg_check || 0), 0) / rows.length;
}

function computeUtilization(seatings: SeatingRow[], totalTables: number): number {
  if (seatings.length === 0 || totalTables === 0) return 0;

  // Seat-hour utilization: sum of (duration / 60) across all seatings
  // divided by total available seat-hours (tables × service hours ~6h)
  const serviceHours = 6;
  const totalSeatHours = seatings.reduce((s, r) => s + ((r.duration_mins || 90) / 60), 0);
  const maxSeatHours = totalTables * serviceHours;

  return Math.round((totalSeatHours / maxSeatHours) * 10000) / 100;
}

function computeDeadGapMinutes(seatings: SeatingRow[], totalTables: number): number {
  if (seatings.length === 0) return 0;

  // Group seatings by table and find gaps between seatings
  const byTable = new Map<string, SeatingRow[]>();
  for (const s of seatings) {
    if (!byTable.has(s.table_id)) byTable.set(s.table_id, []);
    byTable.get(s.table_id)!.push(s);
  }

  let totalGap = 0;
  byTable.forEach((tableSeatings) => {
    const sorted = tableSeatings
      .filter((s) => s.cleared_time && s.seated_time)
      .sort((a, b) => (a.seated_time || '').localeCompare(b.seated_time || ''));

    for (let i = 0; i < sorted.length - 1; i++) {
      const cleared = new Date(sorted[i].cleared_time!).getTime();
      const nextSeated = new Date(sorted[i + 1].seated_time!).getTime();
      const gap = (nextSeated - cleared) / 60000;

      // Dead gap = gap > 20 min between seatings on same table
      if (gap > 20) {
        totalGap += Math.round(gap);
      }
    }
  });

  return totalGap;
}

function countSecondTurns(seatings: SeatingRow[]): number {
  // Count tables that had 2+ seatings in one night
  const byTable = new Map<string, number>();
  for (const s of seatings) {
    byTable.set(s.table_id, (byTable.get(s.table_id) || 0) + 1);
  }

  return Array.from(byTable.values()).filter((count) => count >= 2).length;
}

function deterministicAlternateConversion(id: string, threshold: number): boolean {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  const bucket = (hash % 1000) / 1000;
  return bucket < threshold;
}
