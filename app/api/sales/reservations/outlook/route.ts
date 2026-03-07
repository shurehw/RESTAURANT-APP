/**
 * Reservation Outlook API — Forward-Looking Projection
 *
 * GET /api/sales/reservations/outlook?venue_id=xxx&date=YYYY-MM-DD
 *
 * Projects the reservation book against SevenRooms-authoritative shift
 * pacing and turn times. Surfaces slot-level overbooking opportunities
 * based on historical no-show rates and pacing headroom.
 *
 * Turn times: SevenRooms shift `duration_minutes_by_party_size` (authoritative)
 *             → TipSee historical lookback (fallback)
 * Pacing:     SevenRooms shift `covers_per_seating_interval` per slot
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getTipseeMappingForVenue, getSalesPaceSettings } from '@/lib/database/sales-pace';
import {
  fetchReservationsAllStatuses,
  fetchTableCapacityLookback,
  fetchHistoricalNoShowRate,
  fetchHistoricalTurnTimes,
  fetchSrVenueIdFromTipsee,
  type ReservationSlim,
} from '@/lib/database/tipsee';
import {
  fetchShiftsForDate,
  fetchReservationsForVenueDate,
  resolveSevenRoomsVenueId,
  cacheSrVenueId,
  getTurnMinutesFromShift,
  getPacingForSlot,
  fetchWidgetAccessRulesForVenue,
  type SevenRoomsShift,
  type SevenRoomsReservation,
  type WidgetShiftData,
} from '@/lib/integrations/sevenrooms';
import { getFloorPlanTableMap } from '@/lib/database/floor-plan';

// ─── Types ──────────────────────────────────────────────────────────

type SlotStatus = 'open' | 'tight' | 'full' | 'overbooked';

interface OutlookSlot {
  label: string;
  startHour: number;
  tablesBooked: number;
  tablesAvailable: number;
  coversBooked: number;
  seatsAvailable: number;
  unassignedCovers: number;
  /** SevenRooms pacing ceiling for this slot (covers_per_seating_interval) */
  pacingLimit: number | null;
  /** Headroom vs pacing: pacingLimit - coversBooked (null if no pacing data) */
  pacingHeadroom: number | null;
  status: SlotStatus;
}

interface OverbookSuggestion {
  slotLabel: string;
  currentCovers: number;
  /** SevenRooms pacing ceiling (null = using seat count as ceiling) */
  pacingLimit: number | null;
  expectedNoShows: number;
  suggestedExtra: number;
  /** Effective covers after expected no-shows: currentCovers - expectedNoShows */
  effectiveCovers: number;
  reason: string;
}

interface TableTypeSummary {
  type: string;
  totalTables: number;
  bookedTables: number;
  avgProjectedTurn: number;
}

interface OutlookResponse {
  date: string;
  /** Whether shift data came from SevenRooms (true) or TipSee historical (false) */
  shiftDataSource: 'sevenrooms' | 'historical';
  summary: {
    totalReservations: number;
    totalCovers: number;
    confirmed: number;
    pending: number;
    cancelled: number;
    totalTables: number;
    totalSeats: number;
    peakUtilizationPct: number;
    historicalNoShowRate: number;
    /** SevenRooms shift name for this date (e.g. "Thur.-Sat. Dinner") */
    shiftName: string | null;
    /** SevenRooms covers_per_seating_interval (null if not available) */
    coversPerInterval: number | null;
    intervalMinutes: number | null;
  };
  slots: OutlookSlot[];
  overbookSuggestions: OverbookSuggestion[];
  byTableType: TableTypeSummary[];
  /** Live access rule data from SR widget API (channel allocation, pacing per rule) */
  accessRules: WidgetShiftData[] | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

const normTable = (t: string) => String(t).trim().replace(/^0+/, '').toLowerCase();

/** Map SevenRooms reservation → ReservationSlim for outlook computation */
function srToSlim(r: SevenRoomsReservation): ReservationSlim {
  return {
    id: r.id,
    party_size: r.max_guests || 0,
    arrival_time: r.arrival_time || null,
    seated_time: r.seated_time || null,
    left_time: r.left_time || null,
    status: r.status || 'PENDING',
    table_number: r.table_numbers?.length > 0 ? r.table_numbers.join(', ') : null,
  };
}
const DEFAULT_TURN = 90;

function bucketLabel(capacity: number): string {
  if (capacity <= 2) return '2-top';
  if (capacity <= 4) return '4-top';
  if (capacity <= 6) return '6-top';
  return '8+';
}

function parseArrivalMinutes(arrivalTime: string | null): number | null {
  if (!arrivalTime) return null;
  try {
    const hmMatch = arrivalTime.match(/^(\d{1,2}):(\d{2})/);
    if (hmMatch) {
      return parseInt(hmMatch[1]) * 60 + parseInt(hmMatch[2]);
    }
    const d = new Date(arrivalTime);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  } catch { /* fall through */ }
  return null;
}

function buildTimeSlots(serviceStartHour = 17): Array<{ label: string; startMin: number; endMin: number }> {
  const slots: Array<{ label: string; startMin: number; endMin: number }> = [];
  for (let h = serviceStartHour; h < 25; h++) {
    for (let m = 0; m < 60; m += 30) {
      const realH = h >= 24 ? h - 24 : h;
      const ampm = (h >= 12 && h < 24) ? 'PM' : 'AM';
      const h12 = realH > 12 ? realH - 12 : realH || 12;
      const label = `${h12}:${m === 0 ? '00' : '30'} ${ampm}`;
      slots.push({ label, startMin: h * 60 + m, endMin: h * 60 + m + 30 });
    }
  }
  return slots;
}

// ─── Venue Floor Plans ──────────────────────────────────────────────
// Floor plan table configs are now stored in the `venue_tables` DB table.
// Hardcoded map kept as fallback for venues not yet configured.
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

    // Resolve SR venue_id: static map first, then TipSee auto-discovery
    let srVenueId = resolveSevenRoomsVenueId(venueId);
    if (!srVenueId && locationUuids.length > 0) {
      srVenueId = await fetchSrVenueIdFromTipsee(locationUuids).catch(() => '');
      if (srVenueId) cacheSrVenueId(venueId, srVenueId);
    }

    // Need at least one data source configured
    if (locationUuids.length === 0 && !srVenueId) {
      return NextResponse.json({ error: 'No data source configured for this venue' }, { status: 404 });
    }

    const dateObj = new Date(date + 'T12:00:00');
    const dow = dateObj.getDay();

    // Reservation source: SR API (live, no sync lag) when available, TipSee as fallback.
    // Historical TipSee queries (capacity, no-show, turn times) run regardless —
    // they return empty gracefully when locationUuids is empty.
    const reservationFetch: Promise<{ reservations: ReservationSlim[] }> = srVenueId
      ? fetchReservationsForVenueDate(srVenueId, date)
          .then(srRezs => ({ reservations: srRezs.map(srToSlim) }))
          .catch(() =>
            locationUuids.length > 0
              ? fetchReservationsAllStatuses(locationUuids, date)
              : { reservations: [] }
          )
      : fetchReservationsAllStatuses(locationUuids, date);

    // Parallel fetch — SevenRooms shifts run concurrently with TipSee queries.
    // SR shifts fail silently; historical turn times are the fallback.
    // Widget API fetches access rule data (pacing per channel) — no auth needed.
    const [rezData, capacityMap, noShowData, historicalTurnMap, paceSettings, srShifts, widgetAccessRules] =
      await Promise.all([
        reservationFetch,
        fetchTableCapacityLookback(locationUuids, dow, 90),
        fetchHistoricalNoShowRate(locationUuids, dow, 90),
        fetchHistoricalTurnTimes(locationUuids, dow, 90),
        getSalesPaceSettings(venueId),
        srVenueId
          ? fetchShiftsForDate(srVenueId, date).catch(() => [] as SevenRoomsShift[])
          : Promise.resolve([] as SevenRoomsShift[]),
        fetchWidgetAccessRulesForVenue(venueId, date).catch(() => [] as WidgetShiftData[]),
      ]);

    const serviceStartHour = paceSettings?.service_start_hour ?? 17;

    // Try DB-backed floor plan first, fall back to hardcoded legacy map
    let floorPlanMap = await getFloorPlanTableMap(venueId);
    if (floorPlanMap.size === 0) {
      floorPlanMap = VENUE_FLOOR_PLANS_FALLBACK[venueId] ?? new Map();
    }
    const floorPlan = floorPlanMap.size > 0 ? floorPlanMap : null;

    const outlook = computeOutlook(
      date,
      rezData.reservations,
      capacityMap,
      noShowData,
      historicalTurnMap,
      srShifts,
      floorPlan,
      serviceStartHour,
      widgetAccessRules,
    );

    return NextResponse.json(outlook);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute outlook';
    console.error('Outlook API error:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── Core Computation ───────────────────────────────────────────────

function computeOutlook(
  date: string,
  reservations: ReservationSlim[],
  capacityMap: Map<string, number>,
  noShowData: { noShowCount: number; totalCount: number; rate: number },
  historicalTurnMap: Map<string, number>,
  srShifts: SevenRoomsShift[],
  floorPlan: Map<string, number> | null,
  serviceStartHour: number,
  widgetAccessRules: WidgetShiftData[] = [],
): OutlookResponse {
  const ACTIVE_STATUSES = new Set(['CONFIRMED', 'PENDING', 'ARRIVED', 'SEATED']);
  const active = reservations.filter(r => ACTIVE_STATUSES.has(r.status));
  const cancelled = reservations.filter(r => r.status === 'CANCELED' || r.status === 'CANCELLED');

  const shiftDataSource: 'sevenrooms' | 'historical' = srShifts.length > 0 ? 'sevenrooms' : 'historical';
  const primaryShift = srShifts[0] ?? null;

  // ── Turn time resolver ───────────────────────────────────────────
  // SR shift is authoritative. Historical 4-bucket map is fallback.
  function getTurnMinutes(partySize: number): number {
    if (srShifts.length > 0) {
      return getTurnMinutesFromShift(partySize, srShifts, DEFAULT_TURN);
    }
    // Historical fallback: bucket by capacity label
    const label = bucketLabel(Math.max(2, partySize));
    return historicalTurnMap.get(label) ?? DEFAULT_TURN;
  }

  // ── Table inventory ──────────────────────────────────────────────
  const tableCapacities = new Map<string, number>();

  if (floorPlan) {
    floorPlan.forEach((cap, tn) => tableCapacities.set(tn, cap));
  } else {
    capacityMap.forEach((cap, tn) => tableCapacities.set(tn, cap));
    for (const rez of active) {
      if (!rez.table_number) continue;
      const tables = String(rez.table_number).split(',').map(t => normTable(t)).filter(Boolean);
      for (const tn of tables) {
        if (!tableCapacities.has(tn)) {
          tableCapacities.set(tn, Math.max(2, rez.party_size));
        }
      }
    }
  }

  const totalTables = tableCapacities.size;
  const totalSeats = Array.from(tableCapacities.values()).reduce((s, c) => s + c, 0);

  if (totalTables === 0) {
    return emptyOutlook(date, noShowData.rate);
  }

  // ── Project reservations into time ranges ────────────────────────
  interface Projection {
    rezId: string;
    startMin: number;
    endMin: number;
    partySize: number;
    tables: string[];
  }

  const projections: Projection[] = [];

  for (const rez of active) {
    const arrMin = parseArrivalMinutes(rez.arrival_time);
    if (arrMin === null) continue;

    const adjustedStart = arrMin < 12 * 60 ? arrMin + 24 * 60 : arrMin;
    const tables = rez.table_number
      ? String(rez.table_number).split(',').map(t => normTable(t)).filter(Boolean)
      : [];

    const partySize = rez.party_size || 2;
    const turnMin = getTurnMinutes(partySize);

    projections.push({
      rezId: rez.id,
      startMin: adjustedStart,
      endMin: adjustedStart + turnMin,
      partySize,
      tables,
    });
  }

  // ── Time slot grid ───────────────────────────────────────────────
  const timeSlots = buildTimeSlots(serviceStartHour);
  const slots: OutlookSlot[] = [];
  let peakUtilPct = 0;

  for (const slot of timeSlots) {
    const overlapping = projections.filter(p =>
      p.startMin < slot.endMin && p.endMin > slot.startMin
    );

    const coversBooked = overlapping.reduce((s, p) => s + p.partySize, 0);

    const bookedTableSet = new Set<string>();
    let unassignedCovers = 0;
    for (const p of overlapping) {
      if (p.tables.length > 0) {
        for (const t of p.tables) bookedTableSet.add(t);
      } else {
        unassignedCovers += p.partySize;
      }
    }

    const avgSeatsPerTable = totalTables > 0 ? totalSeats / totalTables : 4;
    const estimatedExtraTables = Math.ceil(unassignedCovers / avgSeatsPerTable);
    const tablesBooked = bookedTableSet.size + estimatedExtraTables;
    const tablesAvailable = Math.max(0, totalTables - tablesBooked);
    const seatsAvailable = totalSeats - coversBooked;

    // Pacing from SevenRooms shift (slot-level or shift-level default)
    const slotStartHour = slot.startMin / 60;
    const pacingLimit = getPacingForSlot(slotStartHour, srShifts);
    const pacingHeadroom = pacingLimit !== null ? Math.max(0, pacingLimit - coversBooked) : null;

    // Status: use pacing ceiling when available, else table-based
    const utilPct = totalTables > 0 ? Math.round((tablesBooked / totalTables) * 100) : 0;
    if (utilPct > peakUtilPct) peakUtilPct = utilPct;

    let status: SlotStatus = 'open';
    if (pacingLimit !== null) {
      if (coversBooked > pacingLimit) status = 'overbooked';
      else if (coversBooked >= pacingLimit) status = 'full';
      else if (coversBooked >= pacingLimit * 0.8) status = 'tight';
    } else {
      if (coversBooked > totalSeats) status = 'overbooked';
      else if (tablesBooked >= totalTables) status = 'full';
      else if (utilPct >= 80) status = 'tight';
    }

    slots.push({
      label: slot.label,
      startHour: slotStartHour,
      tablesBooked,
      tablesAvailable,
      coversBooked,
      seatsAvailable,
      unassignedCovers,
      pacingLimit,
      pacingHeadroom,
      status,
    });
  }

  // ── Overbooking engine ───────────────────────────────────────────
  // For every slot that has a pacing limit and confirmed covers:
  //   effectiveCovers = coversBooked × (1 - noShowRate)
  //   overbookBuffer  = coversBooked × noShowRate  (covers we expect to lose)
  //   safeExtra       = min(overbookBuffer, pacingHeadroom)
  //
  // We surface suggestions on tight/full slots (high-demand) AND on
  // open slots with proven demand (noShowRate >= 5%) so operators can
  // fill pacing headroom they're leaving on the table.

  const overbookSuggestions: OverbookSuggestion[] = [];
  const noShowRate = noShowData.rate;
  const dowNames: Record<number, string> = {
    0: 'Sundays', 1: 'Mondays', 2: 'Tuesdays', 3: 'Wednesdays',
    4: 'Thursdays', 5: 'Fridays', 6: 'Saturdays',
  };
  const dowName = dowNames[new Date(date + 'T12:00:00').getDay()] || 'this day';

  if (noShowRate >= 0.05) {
    for (const slot of slots) {
      if (slot.coversBooked === 0) continue;

      const ceiling = slot.pacingLimit ?? totalSeats;
      const headroom = Math.max(0, ceiling - slot.coversBooked);

      // Expected no-shows for this slot's book
      const expectedNoShows = slot.coversBooked * noShowRate;
      const effectiveCovers = Math.round(slot.coversBooked - expectedNoShows);

      // Safe extra = how many we can overbook without exceeding ceiling
      // (the no-shows will absorb them)
      const safeExtra = Math.min(Math.round(expectedNoShows), headroom);

      if (safeExtra >= 1) {
        overbookSuggestions.push({
          slotLabel: slot.label,
          currentCovers: slot.coversBooked,
          pacingLimit: slot.pacingLimit,
          expectedNoShows: Math.round(expectedNoShows),
          suggestedExtra: safeExtra,
          effectiveCovers,
          reason: `${Math.round(noShowRate * 100)}% no-show rate on ${dowName} — effective covers drop to ${effectiveCovers}`,
        });
      }
    }
  }

  // ── Table type summary ───────────────────────────────────────────
  function getTurnMinutesByCapacity(cap: number): number {
    return getTurnMinutes(cap); // capacity ≈ party size for summary
  }

  const typeGroups = new Map<string, { total: number; booked: Set<string>; turnMin: number }>();
  tableCapacities.forEach((cap) => {
    const label = bucketLabel(cap);
    if (!typeGroups.has(label)) {
      typeGroups.set(label, { total: 0, booked: new Set(), turnMin: getTurnMinutesByCapacity(cap) });
    }
    typeGroups.get(label)!.total++;
  });
  for (const p of projections) {
    for (const t of p.tables) {
      const cap = tableCapacities.get(t);
      if (cap !== undefined) {
        const label = bucketLabel(cap);
        typeGroups.get(label)?.booked.add(t);
      }
    }
  }

  const BUCKET_ORDER = ['2-top', '4-top', '6-top', '8+'];
  const byTableType: TableTypeSummary[] = BUCKET_ORDER
    .filter(label => typeGroups.has(label))
    .map(label => {
      const g = typeGroups.get(label)!;
      return {
        type: label,
        totalTables: g.total,
        bookedTables: g.booked.size,
        avgProjectedTurn: g.turnMin,
      };
    });

  return {
    date,
    shiftDataSource,
    summary: {
      totalReservations: active.length,
      totalCovers: active.reduce((s, r) => s + (r.party_size || 0), 0),
      confirmed: active.filter(r => r.status === 'CONFIRMED').length,
      pending: active.filter(r => r.status === 'PENDING').length,
      cancelled: cancelled.length,
      totalTables,
      totalSeats,
      peakUtilizationPct: peakUtilPct,
      historicalNoShowRate: Math.round(noShowRate * 100) / 100,
      shiftName: primaryShift?.name ?? null,
      coversPerInterval: primaryShift?.covers_per_seating_interval ?? null,
      intervalMinutes: primaryShift?.interval_minutes ?? null,
    },
    slots: slots.filter(s => s.coversBooked > 0 || s.tablesBooked > 0),
    overbookSuggestions,
    byTableType,
    accessRules: widgetAccessRules.length > 0 ? widgetAccessRules : null,
  };
}

function emptyOutlook(date: string, noShowRate: number): OutlookResponse {
  return {
    date,
    shiftDataSource: 'historical',
    summary: {
      totalReservations: 0,
      totalCovers: 0,
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      totalTables: 0,
      totalSeats: 0,
      peakUtilizationPct: 0,
      historicalNoShowRate: Math.round(noShowRate * 100) / 100,
      shiftName: null,
      coversPerInterval: null,
      intervalMinutes: null,
    },
    slots: [],
    overbookSuggestions: [],
    byTableType: [],
    accessRules: null,
  };
}
