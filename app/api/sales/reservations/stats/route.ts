/**
 * Reservation Utilization Stats API
 *
 * GET /api/sales/reservations/stats?venue_id=xxx&date=YYYY-MM-DD
 * Returns turn times, utilization, and demand-constrained lost revenue.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getTipseeMappingForVenue, getVenueTimezone, getSalesPaceSettings } from '@/lib/database/sales-pace';
import {
  fetchReservationsAllStatuses,
  fetchChecksForDate,
  fetchSimphonyChecksForDate,
  fetchTableCapacityLookback,
  getPosTypeForLocations,
  type ReservationSlim,
  type CheckSummary,
} from '@/lib/database/tipsee';
import { getFloorPlanTableMap } from '@/lib/database/floor-plan';

// ─── Types ──────────────────────────────────────────────────────────

interface TableTypeStats {
  type: string;
  tableCount: number;
  avgTurns: number;
  avgTurnMinutes: number;
  avgRevenue: number;
  utilizationPct: number;
}

interface PerTableStats {
  tableNumber: string;
  inferredCapacity: number;
  turns: number;
  avgTurnMinutes: number;
  occupiedMinutes: number;
  gapMinutes: number;
  deadSeats: number;
  revenue: number;
}

interface ReservationStats {
  serviceWindow: {
    start: string;
    end: string;
    durationMinutes: number;
  };
  overall: {
    avgTurnMinutes: number;
    totalTurns: number;
    occupiedSeatHours: number;
    availableSeatHours: number;
    utilizationPct: number;
    deadSeatHours: number;
    gapHours: number;
    revenuePerCoverHour: number;
  };
  tableTypes: TableTypeStats[];
  perTable: PerTableStats[];
  demandSignals: {
    cancellations: number;
    noShows: number;
    walkIns: number;
  };
  lostRevenue: {
    fromGaps: number;
    fromDeadSeats: number;
    demandConstrained: number;
  };
  // POS-validated count: checks on floor plan tables = actual parties that dined.
  // More accurate than reservation statuses (which are often stale from 7rooms).
  posValidated: {
    parties: number;
    covers: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

const normTable = (t: string) => String(t).trim().replace(/^0+/, '').toLowerCase();

const DEFAULT_TURN_MINUTES = 90;

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 60000);
}

/**
 * Parse a timestamp string into a Date. Handles both full timestamps
 * (ISO/UTC) and time-only strings like "17:00:00" (from arrival_time).
 * Time-only strings are treated as UTC on epoch date — only useful for
 * comparison, not for absolute positioning.
 */
function parseTime(t: string | null): Date | null {
  if (!t) return null;
  try {
    // Time-only strings like "17:00:00" — prefix with a date
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) {
      const d = new Date(`1970-01-01T${t}Z`);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

/** Format a UTC Date as a local time string in the venue's timezone. */
function fmtTime(d: Date, tz: string): string {
  if (isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    }).format(d);
  } catch {
    // Fallback: format UTC directly
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
}

function bucketLabel(capacity: number): string {
  if (capacity <= 2) return '2-top';
  if (capacity <= 4) return '4-top';
  if (capacity <= 6) return '6-top';
  return '8+';
}

/**
 * Find the check on a table whose open_time best matches a reservation's
 * seated time. Allows up to 45 minutes of drift (host may open the check
 * before or after the guest is formally seated in SevenRooms).
 */
function findMatchingCheck(
  checkSlots: { open: Date; close: Date | null }[],
  seatedTime: Date
): { open: Date; close: Date | null } | null {
  const MAX_DRIFT_MS = 45 * 60 * 1000; // 45 minutes
  let best: { open: Date; close: Date | null } | null = null;
  let bestDrift = Infinity;

  for (const slot of checkSlots) {
    const drift = Math.abs(slot.open.getTime() - seatedTime.getTime());
    if (drift < bestDrift && drift <= MAX_DRIFT_MS) {
      bestDrift = drift;
      best = slot;
    }
  }
  return best;
}

// ─── Venue Floor Plans ──────────────────────────────────────────────
// Floor plan table configs are now stored in the `venue_tables` DB table
// and accessed via getFloorPlanTableMap(). The hardcoded map below is
// kept as a fallback only for venues that haven't configured their floor
// plan in the UI yet.
const VENUE_FLOOR_PLANS_FALLBACK: Record<string, Map<string, number>> = {
  // Delilah LA — 33 tables
  '11111111-1111-1111-1111-111111111111': new Map([
    ['1',4],['2',4],['3',6],['4',4],['5',4],
    ['11',8],['12',8],['13',8],['14',8],['15',5],['16',6],
    ['21',6],['22',2],['23',5],['24',6],['25',7],['26',4],['27',2],
    ['31',3],['32',3],['33',3],['34',3],['35',3],['36',3],['37',3],['38',3],
    ['41',2],['42',2],['43',2],['44',2],['45',2],['46',2],['47',2],
  ]),
};

// ─── Route Handler ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const userId = user?.id || cookieStore.get('user_id')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const venueId = request.nextUrl.searchParams.get('venue_id');
  const date = request.nextUrl.searchParams.get('date');

  if (!venueId || !date) {
    return NextResponse.json({ error: 'venue_id and date are required' }, { status: 400 });
  }

  try {
    const locationUuids = await getTipseeMappingForVenue(venueId);
    if (locationUuids.length === 0) {
      return NextResponse.json({ error: 'No TipSee mapping for this venue' }, { status: 404 });
    }

    // DOW for capacity lookback (0=Sun, 6=Sat)
    const dateObj = new Date(date + 'T12:00:00');
    const dow = dateObj.getDay();

    // Determine POS type to pick the right check fetcher
    const posType = await getPosTypeForLocations(locationUuids);
    const checkFetcher = posType === 'simphony' ? fetchSimphonyChecksForDate : fetchChecksForDate;

    // Parallel data fetch
    const [rezData, checkData, capacityMap, venueTz, paceSettings] = await Promise.all([
      fetchReservationsAllStatuses(locationUuids, date),
      checkFetcher(locationUuids, date, 0).catch(() => ({ checks: [] as CheckSummary[], total: 0 })),
      fetchTableCapacityLookback(locationUuids, dow, 90),
      getVenueTimezone(venueId),
      getSalesPaceSettings(venueId),
    ]);

    const serviceStartHour = paceSettings?.service_start_hour ?? 17; // default 5 PM

    // Try DB-backed floor plan first, fall back to hardcoded legacy map
    let floorPlan = await getFloorPlanTableMap(venueId);
    if (floorPlan.size === 0) {
      floorPlan = VENUE_FLOOR_PLANS_FALLBACK[venueId] ?? new Map();
    }
    const floorPlanOrNull = floorPlan.size > 0 ? floorPlan : null;
    const stats = computeStats(rezData.reservations, checkData.checks, capacityMap, venueTz, date, serviceStartHour, floorPlanOrNull);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute stats';
    console.error('Reservation stats error:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Core Computation ───────────────────────────────────────────────

function computeStats(
  reservations: ReservationSlim[],
  checks: CheckSummary[],
  capacityMap: Map<string, number>,
  venueTz: string,
  dateStr: string,
  serviceStartHour: number,
  floorPlan: Map<string, number> | null
): ReservationStats {
  // Classify by status. SevenRooms uses many statuses beyond COMPLETE —
  // course-tracking (1ST_COURSE, 2ND_COURSE, DESSERT, etc.), BUS_TABLE,
  // CHECK_DROPPED, NOT_RECONCILED — all represent guests who were actually
  // seated. Instead of whitelisting, we treat any reservation that has a
  // seated_time OR is not in a known "didn't happen" bucket as a seating.
  const NOT_SEATED = new Set(['CANCELED', 'CANCELLED', 'NO_SHOW', 'LEFT_MESSAGE', 'CONFIRMED', 'PENDING']);
  const completed = reservations.filter(r => !NOT_SEATED.has(r.status));
  const canceled = reservations.filter(r => r.status === 'CANCELED' || r.status === 'CANCELLED');
  const noShows = reservations.filter(r => r.status === 'NO_SHOW');

  // ── Build check timeline per table ──────────────────────────────────
  // Check open_time/close_time are the authoritative signal for when a
  // table was actually occupied. We use them to:
  // 1. Fill in missing seated_time/left_time on reservations
  // 2. Derive accurate service windows
  // 3. Map revenue to tables

  interface CheckSlot {
    open: Date;
    close: Date | null;
    revenue: number;
    guestCount: number;
  }

  const checksByTable = new Map<string, CheckSlot[]>();
  const tableRevMap = new Map<string, number>();

  for (const check of checks) {
    const tn = normTable(check.table_name || '');
    if (!tn) continue;

    // Revenue map
    tableRevMap.set(tn, (tableRevMap.get(tn) || 0) + (check.revenue_total || 0));

    // Check timeline
    const open = parseTime(check.open_time);
    if (!open) continue;
    const close = parseTime(check.close_time);
    if (!checksByTable.has(tn)) checksByTable.set(tn, []);
    checksByTable.get(tn)!.push({
      open,
      close,
      revenue: check.revenue_total || 0,
      guestCount: check.guest_count || 0,
    });
  }

  // Sort check slots by open time
  for (const slots of checksByTable.values()) {
    slots.sort((a, b) => a.open.getTime() - b.open.getTime());
  }

  // ── Build per-table timelines from reservations ─────────────────────

  interface Seating {
    seated: Date | null;
    left: Date | null;
    partySize: number;
    rezId: string;
  }

  const tableTimelines = new Map<string, Seating[]>();

  for (const rez of completed) {
    if (!rez.table_number) continue;
    const rawTables = String(rez.table_number).split(',').map(t => normTable(t)).filter(Boolean);
    if (rawTables.length === 0) continue;

    let seated = parseTime(rez.seated_time);
    let left = parseTime(rez.left_time);
    const partySize = rez.party_size || 2;

    for (const tn of rawTables) {
      // Try to fill in missing left_time from check close_time
      // Find a check on this table whose open_time is close to seated
      if (!left && seated) {
        const checkSlots = checksByTable.get(tn);
        if (checkSlots) {
          const matchingCheck = findMatchingCheck(checkSlots, seated);
          if (matchingCheck?.close) {
            left = matchingCheck.close;
          }
        }
      }

      if (!tableTimelines.has(tn)) tableTimelines.set(tn, []);
      tableTimelines.get(tn)!.push({
        seated,
        left,
        partySize: rawTables.length > 1 ? Math.ceil(partySize / rawTables.length) : partySize,
        rezId: rez.id,
      });
    }
  }

  // Sort each table's seatings by seated time
  for (const seatings of tableTimelines.values()) {
    seatings.sort((a, b) => {
      if (!a.seated && !b.seated) return 0;
      if (!a.seated) return 1;
      if (!b.seated) return -1;
      return a.seated.getTime() - b.seated.getTime();
    });
  }

  // ── Filter to floor plan tables only ─────────────────────────────────
  // If a floor plan is configured for this venue, drop any table not on
  // the plan (bar seats, sections, event spaces, virtual tables).
  if (floorPlan) {
    for (const tn of [...tableTimelines.keys()]) {
      if (!floorPlan.has(tn)) tableTimelines.delete(tn);
    }
  }

  // ── Derive service window ────────────────────────────────────────────
  // Use reservation seatings as primary source. For the end of service,
  // also consider seated + DEFAULT_TURN for tables that never got a
  // left_time (host didn't close them out in SevenRooms — common for
  // the last tables of the night). Also check for the latest check
  // close_time on reservation tables as the best proxy for actual close.
  let earliestSeated: Date | null = null;
  let latestLeft: Date | null = null;

  for (const seatings of tableTimelines.values()) {
    for (const s of seatings) {
      if (s.seated && (!earliestSeated || s.seated < earliestSeated)) earliestSeated = s.seated;
      if (s.left && (!latestLeft || s.left > latestLeft)) latestLeft = s.left;
      // For seatings without left_time, use seated + default turn as floor
      if (s.seated && !s.left) {
        const projected = new Date(s.seated.getTime() + DEFAULT_TURN_MINUTES * 60000);
        if (!latestLeft || projected > latestLeft) latestLeft = projected;
      }
    }
  }

  // Also check latest check close on reservation tables — this is the
  // ground truth for when the last table was actually cleared.
  for (const tn of tableTimelines.keys()) {
    const checkSlots = checksByTable.get(tn);
    if (!checkSlots) continue;
    for (const c of checkSlots) {
      if (c.close && (!latestLeft || c.close > latestLeft)) latestLeft = c.close;
    }
  }

  if (!earliestSeated || !latestLeft || tableTimelines.size === 0) {
    return emptyStats();
  }

  // Apply venue open time as a floor for the service window start.
  // service_start_hour is in local venue time (e.g., 18 = 6 PM local).
  // Convert to UTC for comparison with stored timestamps.
  // Use a simpler approach: compute the local hour of earliestSeated and
  // clamp it to at least serviceStartHour.
  const localFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', hour12: false, timeZone: venueTz,
  });
  const localParts = localFormatter.formatToParts(earliestSeated);
  const localHour = parseInt(localParts.find(p => p.type === 'hour')?.value || '0');
  const localMinute = parseInt(localParts.find(p => p.type === 'minute')?.value || '0');
  const earliestLocalDecimal = localHour + localMinute / 60;

  // If earliest seating is before the venue's service start, clamp it
  if (earliestLocalDecimal < serviceStartHour) {
    const offsetMs = (serviceStartHour - earliestLocalDecimal) * 3600000;
    earliestSeated = new Date(earliestSeated.getTime() + offsetMs);
  }

  const serviceDurationMinutes = minutesBetween(earliestSeated, latestLeft);
  const serviceHours = serviceDurationMinutes / 60;

  // Resolve table capacities.
  // Floor plan is ground truth when available.  Fall back to lookback,
  // then today's max party size.  Cap at 10 for venues without a floor plan.
  const MAX_TABLE_CAPACITY = 10;
  const resolvedCapacity = new Map<string, number>();
  for (const tn of tableTimelines.keys()) {
    // Floor plan capacity is authoritative
    if (floorPlan?.has(tn)) {
      resolvedCapacity.set(tn, floorPlan.get(tn)!);
      continue;
    }
    const seatings = tableTimelines.get(tn)!;
    const maxToday = Math.max(2, ...seatings.map(s => s.partySize));
    const todayCap = Math.min(MAX_TABLE_CAPACITY, maxToday);
    const lookbackCap = capacityMap.get(tn);
    const cap = lookbackCap ? Math.max(todayCap, lookbackCap) : todayCap;
    resolvedCapacity.set(tn, cap);
  }

  // ── Per-table metrics ──────────────────────────────────────────────

  let totalOccupiedSeatHours = 0;
  let totalDeadSeatHours = 0;
  let totalGapMinutes = 0;
  let totalTurns = 0;
  let totalDiningRevenue = 0;
  const perTable: PerTableStats[] = [];

  for (const [tn, seatings] of tableTimelines) {
    const capacity = resolvedCapacity.get(tn) || 2;
    const revenue = tableRevMap.get(tn) || 0;
    totalDiningRevenue += revenue;

    let occupiedMin = 0;
    let gapMin = 0;
    let deadSeats = 0;
    const turnDurations: number[] = [];

    for (let i = 0; i < seatings.length; i++) {
      const s = seatings[i];
      const duration = (s.seated && s.left)
        ? minutesBetween(s.seated, s.left)
        : DEFAULT_TURN_MINUTES;
      occupiedMin += duration;
      turnDurations.push(duration);

      // Dead seats: capacity minus actual party
      const wasted = Math.max(0, capacity - s.partySize);
      deadSeats += wasted * (duration / 60);

      // Gap to next seating
      if (i < seatings.length - 1) {
        const next = seatings[i + 1];
        if (s.left && next.seated) {
          gapMin += minutesBetween(s.left, next.seated);
        }
      }
    }

    // Pre-first and post-last gaps (only if > 30 min)
    const firstSeated = seatings[0].seated;
    if (firstSeated && earliestSeated) {
      const preGap = minutesBetween(earliestSeated, firstSeated);
      if (preGap > 30) gapMin += preGap;
    }
    const lastLeft = seatings[seatings.length - 1].left;
    if (lastLeft && latestLeft) {
      const postGap = minutesBetween(lastLeft, latestLeft);
      if (postGap > 30) gapMin += postGap;
    }

    const avgParty = seatings.reduce((s, x) => s + x.partySize, 0) / seatings.length;
    totalOccupiedSeatHours += (occupiedMin / 60) * avgParty;
    totalDeadSeatHours += deadSeats;
    totalGapMinutes += gapMin;
    totalTurns += seatings.length;

    const avgTurn = turnDurations.length > 0
      ? Math.round(turnDurations.reduce((s, d) => s + d, 0) / turnDurations.length)
      : 0;

    perTable.push({
      tableNumber: tn,
      inferredCapacity: capacity,
      turns: seatings.length,
      avgTurnMinutes: avgTurn,
      occupiedMinutes: Math.round(occupiedMin),
      gapMinutes: Math.round(gapMin),
      deadSeats: Math.round(deadSeats * 10) / 10,
      revenue: Math.round(revenue),
    });
  }

  // Sort perTable by table number
  perTable.sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }));

  // ── Aggregate metrics ─────────────────────────────────────────────

  const totalSeats = Array.from(resolvedCapacity.values()).reduce((s, c) => s + c, 0);
  const totalTables = resolvedCapacity.size;
  const availableSeatHours = totalSeats * serviceHours;
  const utilizationPct = availableSeatHours > 0
    ? Math.round((totalOccupiedSeatHours / availableSeatHours) * 100)
    : 0;

  const revenuePerCoverHour = totalOccupiedSeatHours > 0
    ? totalDiningRevenue / totalOccupiedSeatHours
    : 0;

  // Overall average turn time
  const allTurnMinutes = perTable.flatMap(t =>
    Array(t.turns).fill(t.avgTurnMinutes)
  );
  const avgTurnMinutes = allTurnMinutes.length > 0
    ? Math.round(allTurnMinutes.reduce((s, d) => s + d, 0) / allTurnMinutes.length)
    : 0;

  // ── Table type breakdown ──────────────────────────────────────────

  const buckets = new Map<string, PerTableStats[]>();
  for (const t of perTable) {
    const label = bucketLabel(t.inferredCapacity);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(t);
  }

  const BUCKET_ORDER = ['2-top', '4-top', '6-top', '8+'];
  const tableTypes: TableTypeStats[] = BUCKET_ORDER
    .filter(label => buckets.has(label))
    .map(label => {
      const tables = buckets.get(label)!;
      const n = tables.length;
      const totalTrns = tables.reduce((s, t) => s + t.turns, 0);
      const tablesWithTurns = tables.filter(t => t.turns > 0);
      const avgTurns = tablesWithTurns.length > 0
        ? Math.round(totalTrns / tablesWithTurns.length * 10) / 10
        : 0;
      const avgTurn = tablesWithTurns.length > 0
        ? Math.round(tablesWithTurns.reduce((s, t) => s + t.avgTurnMinutes, 0) / tablesWithTurns.length)
        : 0;
      const avgRev = tablesWithTurns.length > 0
        ? Math.round(tablesWithTurns.reduce((s, t) => s + t.revenue, 0) / tablesWithTurns.length)
        : 0;
      const bucketCapacity = tables.reduce((s, t) => s + t.inferredCapacity, 0);
      const bucketOccupied = tables.reduce((s, t) => s + t.occupiedMinutes, 0);
      const bucketAvailable = bucketCapacity * serviceDurationMinutes;
      const util = bucketAvailable > 0
        ? Math.round((bucketOccupied / bucketAvailable) * 100)
        : 0;

      return {
        type: label,
        tableCount: n,
        avgTurns,
        avgTurnMinutes: avgTurn,
        avgRevenue: avgRev,
        utilizationPct: util,
      };
    });

  // ── Demand signals ────────────────────────────────────────────────

  const cancelledCovers = canceled.reduce((s, r) => s + (r.party_size || 2), 0);
  const noShowCovers = noShows.reduce((s, r) => s + (r.party_size || 2), 0);

  // Walk-in estimate: check covers minus completed reservation covers
  const totalCheckCovers = checks.reduce((s, c) => s + (c.guest_count || 0), 0);
  const totalRezCovers = completed.reduce((s, r) => s + (r.party_size || 0), 0);
  const walkInCovers = Math.max(0, totalCheckCovers - totalRezCovers);

  // ── Lost revenue ──────────────────────────────────────────────────

  const avgSeatsPerTable = totalTables > 0 ? totalSeats / totalTables : 2;
  const lostFromGaps = (totalGapMinutes / 60) * revenuePerCoverHour * avgSeatsPerTable;
  const lostFromDeadSeats = totalDeadSeatHours * revenuePerCoverHour;

  // Demand-constrained: cap lost revenue by proven excess demand
  const totalProvenDemandCovers = cancelledCovers + noShowCovers + walkInCovers;
  const avgTurnHours = avgTurnMinutes > 0 ? avgTurnMinutes / 60 : 1.5;
  const provenDemandValue = totalProvenDemandCovers * revenuePerCoverHour * avgTurnHours;
  const demandConstrained = Math.min(
    Math.round(lostFromGaps + lostFromDeadSeats),
    Math.round(provenDemandValue)
  );

  // ── POS-validated count ─────────────────────────────────────────────
  // Count checks on floor plan tables as ground truth for "how many
  // parties actually dined." Reservation statuses are often stale
  // (7rooms doesn't push final status updates to our data pipeline).
  let posParties = 0;
  let posCovers = 0;
  for (const check of checks) {
    const tn = normTable(check.table_name || '');
    if (!tn) continue;
    const isFloorPlan = floorPlan ? floorPlan.has(tn) : resolvedCapacity.has(tn);
    if (isFloorPlan) {
      posParties++;
      posCovers += check.guest_count || 0;
    }
  }

  return {
    serviceWindow: {
      start: fmtTime(earliestSeated, venueTz),
      end: fmtTime(latestLeft, venueTz),
      durationMinutes: Math.round(serviceDurationMinutes),
    },
    overall: {
      avgTurnMinutes,
      totalTurns,
      occupiedSeatHours: Math.round(totalOccupiedSeatHours * 10) / 10,
      availableSeatHours: Math.round(availableSeatHours * 10) / 10,
      utilizationPct,
      deadSeatHours: Math.round(totalDeadSeatHours * 10) / 10,
      gapHours: Math.round(totalGapMinutes / 60 * 10) / 10,
      revenuePerCoverHour: Math.round(revenuePerCoverHour),
    },
    tableTypes,
    perTable,
    demandSignals: {
      cancellations: cancelledCovers,
      noShows: noShowCovers,
      walkIns: walkInCovers,
    },
    lostRevenue: {
      fromGaps: Math.round(lostFromGaps),
      fromDeadSeats: Math.round(lostFromDeadSeats),
      demandConstrained: Math.max(0, demandConstrained),
    },
    posValidated: {
      parties: posParties,
      covers: posCovers,
    },
  };
}

function emptyStats(): ReservationStats {
  return {
    serviceWindow: { start: '', end: '', durationMinutes: 0 },
    overall: {
      avgTurnMinutes: 0,
      totalTurns: 0,
      occupiedSeatHours: 0,
      availableSeatHours: 0,
      utilizationPct: 0,
      deadSeatHours: 0,
      gapHours: 0,
      revenuePerCoverHour: 0,
    },
    tableTypes: [],
    perTable: [],
    demandSignals: { cancellations: 0, noShows: 0, walkIns: 0 },
    lostRevenue: { fromGaps: 0, fromDeadSeats: 0, demandConstrained: 0 },
    posValidated: { parties: 0, covers: 0 },
  };
}
