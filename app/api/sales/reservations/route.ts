/**
 * Reservation + Check List API
 *
 * GET /api/sales/reservations?venue_id=xxx&date=YYYY-MM-DD
 * Returns SevenRooms reservations enriched with POS checks via
 * normalized table number matching, plus unmatched checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';
import {
  fetchReservationsForDate,
  fetchChecksForDate,
  fetchSrVenueIdFromTipsee,
  type ReservationSummary,
} from '@/lib/database/tipsee';
import {
  fetchReservationsForVenueDate,
  resolveSevenRoomsVenueId,
  cacheSrVenueId,
  type SevenRoomsReservation,
} from '@/lib/integrations/sevenrooms';

/** Normalize a table identifier: trim, strip leading zeros, lowercase */
const normTable = (t: string) => String(t).trim().replace(/^0+/, '').toLowerCase();

/** Map SevenRooms reservation → ReservationSummary for guest list display */
function srToSummary(r: SevenRoomsReservation): ReservationSummary {
  return {
    id: r.id,
    first_name: r.first_name || '',
    last_name: r.last_name || '',
    party_size: r.max_guests || 0,
    arrival_time: r.arrival_time || null,
    seated_time: r.seated_time || null,
    left_time: r.left_time || null,
    status: r.status || 'PENDING',
    booked_by: r.booked_by || null,
    is_vip: r.is_vip || false,
    tags: r.tags?.map(t => t.tag) ?? null,
    min_price: r.min_price ?? null,
    reservation_type: r.shift_category || null,
    venue_seating_area_name: null,
    notes: r.notes || null,
    client_requests: r.client_requests || null,
    table_number: r.table_numbers?.length > 0 ? r.table_numbers.join(', ') : null,
  };
}

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
    return NextResponse.json(
      { error: 'venue_id and date are required' },
      { status: 400 }
    );
  }

  try {
    const locationUuids = await getTipseeMappingForVenue(venueId);

    // Resolve SR venue_id: static map first, then TipSee auto-discovery
    let srVenueId = resolveSevenRoomsVenueId(venueId);
    if (!srVenueId && locationUuids.length > 0) {
      srVenueId = await fetchSrVenueIdFromTipsee(locationUuids).catch(() => '');
      if (srVenueId) cacheSrVenueId(venueId, srVenueId);
    }

    if (locationUuids.length === 0 && !srVenueId) {
      return NextResponse.json({
        reservations: [],
        checks: [],
        total: 0,
        check_total: 0,
        message: 'No data source configured for this venue',
      });
    }

    // Reservation source: SR API (live) when available, TipSee as fallback.
    const reservationFetch: Promise<{ reservations: ReservationSummary[]; total: number }> =
      srVenueId
        ? fetchReservationsForVenueDate(srVenueId, date)
            .then(srRezs => ({ reservations: srRezs.map(srToSummary), total: srRezs.length }))
            .catch(() =>
              locationUuids.length > 0
                ? fetchReservationsForDate(locationUuids, date)
                : { reservations: [], total: 0 }
            )
        : fetchReservationsForDate(locationUuids, date);

    // Fetch reservations + checks in parallel (checks require TipSee mapping)
    const [rezData, checkData] = await Promise.all([
      reservationFetch,
      locationUuids.length > 0
        ? fetchChecksForDate(locationUuids, date, 0).catch(() => ({ checks: [] as any[], total: 0 }))
        : Promise.resolve({ checks: [] as any[], total: 0 }),
    ]);

    const { reservations, total } = rezData;
    const checks = checkData.checks;

    // Build normalized table_name → checks lookup
    const checksByTable = new Map<string, typeof checks>();
    for (const check of checks) {
      const tbl = normTable(check.table_name || '');
      if (!tbl) continue;
      const existing = checksByTable.get(tbl) || [];
      existing.push(check);
      checksByTable.set(tbl, existing);
    }

    // Build normalized check name → checks lookup (for Tab-type name matching)
    const checksByName = new Map<string, typeof checks>();
    for (const check of checks) {
      const n = String(check.name || '').trim().toLowerCase();
      if (!n) continue;
      const existing = checksByName.get(n) || [];
      existing.push(check);
      checksByName.set(n, existing);
    }

    const addCheck = (
      matched: Array<{ id: string; revenue_total: number; employee_name: string; tip_total: number; comp_total: number; guest_count: number }>,
      c: (typeof checks)[number]
    ) => {
      if (!matched.some(m => m.id === c.id)) {
        matched.push({
          id: c.id,
          revenue_total: c.revenue_total,
          employee_name: c.employee_name,
          tip_total: c.tip_total,
          comp_total: c.comp_total,
          guest_count: c.guest_count,
        });
      }
    };

    // Enrich reservations with matched checks
    const enriched = reservations.map(rez => {
      const matched: Array<{
        id: string;
        revenue_total: number;
        employee_name: string;
        tip_total: number;
        comp_total: number;
        guest_count: number;
      }> = [];

      // 1. Match by table number
      if (rez.table_number) {
        const tables = String(rez.table_number).split(',').map(normTable).filter(Boolean);
        for (const tbl of tables) {
          const tableChecks = checksByTable.get(tbl);
          if (tableChecks) {
            for (const c of tableChecks) addCheck(matched, c);
          }
        }
      }

      // 2. Fallback: match by last name (Tab checks opened under guest name)
      if (matched.length === 0 && rez.last_name) {
        const nameChecks = checksByName.get(rez.last_name.trim().toLowerCase());
        if (nameChecks) {
          for (const c of nameChecks) addCheck(matched, c);
        }
      }

      const matchedRevenue = matched.reduce((sum, c) => sum + c.revenue_total, 0);

      return {
        ...rez,
        matched_checks: matched.length > 0 ? matched : null,
        matched_revenue: matchedRevenue,
      };
    });

    // Unmatched checks = not linked to any reservation (excluding virtual "Open Tab" checks)
    const matchedCheckIds = new Set<string>();
    for (const rez of enriched) {
      if (rez.matched_checks) {
        for (const mc of rez.matched_checks) matchedCheckIds.add(mc.id);
      }
    }

    const unmatchedChecks = checks
      .filter(c => !matchedCheckIds.has(c.id) && String(c.table_name || '') !== 'Open Tab')
      .map(c => ({
        id: c.id,
        table_name: String(c.table_name || ''),
        employee_name: String(c.employee_name || ''),
        guest_count: c.guest_count || 0,
        revenue_total: c.revenue_total || 0,
        comp_total: c.comp_total || 0,
        tip_total: c.tip_total || 0,
        open_time: c.open_time || null,
        close_time: c.close_time || null,
        is_open: c.is_open || false,
      }));

    return NextResponse.json({
      reservations: enriched,
      checks: unmatchedChecks,
      total,
      check_total: unmatchedChecks.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch reservations';
    console.error('Reservations API error:', message, error instanceof Error ? error.stack : '');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
