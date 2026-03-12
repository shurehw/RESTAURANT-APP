/**
 * Live Reservation Sync
 *
 * POST /api/floor-plan/live/sync
 * Body: { venue_id, date }
 *
 * Lightweight endpoint for the host stand to keep reservations in sync
 * with SevenRooms in near-real-time. Fetches only recently updated
 * reservations (last 5 minutes) and upserts changes.
 *
 * Called by the host stand every 2 minutes during service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  fetchReservationsUpdatedSince,
  resolveSevenRoomsVenueId,
} from '@/lib/integrations/sevenrooms';
import { upsertReservation, type ReservationStatus } from '@/lib/database/reservations';
import { transitionTable, type TableState } from '@/lib/floor-management/table-state-machine';

// SR course statuses that should auto-transition the table_status record.
// SevenRooms sends these in real-time as the server updates the course on the POS/tablet.
const SR_COURSE_TABLE_TRANSITIONS: Record<string, TableState | null> = {
  '1ST_COURSE': null,           // first course → table stays 'seated', no change needed
  '2ND_COURSE': 'occupied',     // main course firing → mark occupied
  '3RD_COURSE': 'occupied',
  'DESSERT': 'occupied',
  'BUS_TABLE': 'check_dropped', // guests done, bussing table
};

// SR status → OpSOS status
const SR_STATUS_MAP: Record<string, ReservationStatus> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ARRIVED: 'arrived',
  SEATED: 'seated',
  COMPLETED: 'completed',
  COMPLETE: 'completed',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
  NO_SHOW: 'no_show',
  WAITLIST: 'waitlisted',
  NOT_RECONCILED: 'completed',
  LEFT: 'completed',
  // SR meal-progress statuses → seated
  '1ST_COURSE': 'seated',
  '2ND_COURSE': 'seated',
  '3RD_COURSE': 'seated',
  DESSERT: 'seated',
  BUS_TABLE: 'completed',
};

function mapStatus(srStatus: string): ReservationStatus {
  return SR_STATUS_MAP[srStatus?.toUpperCase()] || 'confirmed';
}

function parseSrTime(timeStr: string | null): string {
  if (!timeStr) return '19:00';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(timeStr)) return timeStr.slice(0, 5);
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let h = parseInt(match[1]);
    if (match[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${match[2]}`;
  }
  return '19:00';
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, date } = body;

    if (!venue_id || !date) {
      return NextResponse.json(
        { error: 'venue_id and date are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    const srVenueId = resolveSevenRoomsVenueId(venue_id);
    if (!srVenueId) {
      return NextResponse.json({
        synced: 0,
        message: 'No SevenRooms mapping for this venue',
      });
    }

    // Fetch reservations updated in the last 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const updatedSince = fiveMinAgo.toISOString().replace('Z', '');

    const venueGroupId = process.env.SEVENROOMS_VENUE_GROUP_ID;
    if (!venueGroupId) {
      return NextResponse.json({
        synced: 0,
        message: 'SEVENROOMS_VENUE_GROUP_ID not configured',
      });
    }

    let srReservations;
    try {
      srReservations = await fetchReservationsUpdatedSince(
        venueGroupId,
        updatedSince,
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: `SR API error: ${err.message}`, synced: 0 },
        { status: 502 },
      );
    }

    // Filter to this venue + date
    const forVenueDate = srReservations.filter(
      (r) => r.venue_id === srVenueId && r.date === date,
    );

    let synced = 0;
    const errors: string[] = [];

    for (const sr of forVenueDate) {
      try {
        const rez = await upsertReservation(orgId, venue_id, {
          first_name: sr.first_name || '',
          last_name: sr.last_name || '',
          party_size: sr.max_guests || 2,
          business_date: date,
          arrival_time: parseSrTime(sr.arrival_time),
          status: mapStatus(sr.status),
          channel: 'sevenrooms',
          external_id: sr.id,
          is_vip: sr.is_vip || false,
          tags: sr.tags?.map((t) => t.tag) || [],
          notes: sr.notes || null,
          client_requests: sr.client_requests || null,
          min_spend: sr.min_price ?? null,
          booked_by: sr.booked_by || null,
          last_synced_at: new Date().toISOString(),
          sync_source: 'sevenrooms',
        });
        synced++;

        // ── Course-based table auto-statusing ──────────────────────────
        // When SR sends a course progression status, auto-transition the
        // table(s) assigned to this reservation without host intervention.
        const srStatusUpper = (sr.status || '').toUpperCase();
        const targetTableState = SR_COURSE_TABLE_TRANSITIONS[srStatusUpper];

        if (targetTableState !== undefined && rez.table_ids?.length) {
          for (const tableId of rez.table_ids) {
            // BUS_TABLE: the table may still be 'seated' — chain to check_dropped
            if (targetTableState === 'check_dropped') {
              // Try seated→occupied first (no-op if already occupied)
              await transitionTable(venue_id, orgId, tableId, date, 'occupied', null, 'pos_auto');
              await transitionTable(venue_id, orgId, tableId, date, 'check_dropped', null, 'pos_auto');
            } else if (targetTableState !== null) {
              await transitionTable(venue_id, orgId, tableId, date, targetTableState, null, 'pos_auto');
            }
          }
        }
      } catch (err: any) {
        errors.push(`${sr.first_name} ${sr.last_name}: ${err.message}`);
      }
    }

    return NextResponse.json({
      synced,
      total_from_sr: srReservations.length,
      for_venue_date: forVenueDate.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  });
}
