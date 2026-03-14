/**
 * Reservations CRUD API
 *
 * GET  /api/reservations?venue_id=xxx&date=YYYY-MM-DD
 *      Returns native reservations. Falls back to SR/TipSee during migration.
 *
 * POST /api/reservations
 *      Create a reservation. Enforces access rule pacing limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  getReservationsForVenueDate,
  upsertReservation,
  getActiveAccessRulesForDate,
  getRemainingCoversForSlot,
  insertReservationEvent,
  type ReservationChannel,
} from '@/lib/database/reservations';
import { getServiceClient } from '@/lib/supabase/service';

type ReservationRequestInsert = {
  org_id: string;
  venue_id: string;
  requested_date: string;
  requested_time: string;
  requested_party_size: number;
  channel: string;
  guest_name: string | null;
  was_accepted: boolean;
  reservation_id: string | null;
  rejected_reason: string | null;
};

/** Log every inbound request to reservation_requests for demand capture. */
async function logReservationRequest(
  orgId: string,
  venueId: string,
  date: string,
  time: string,
  partySize: number,
  channel: string,
  guestName: string | null,
  wasAccepted: boolean,
  reservationId: string | null,
  rejectedReason: string | null,
) {
  try {
    const svc = getServiceClient();
    const payload: ReservationRequestInsert = {
      org_id: orgId,
      venue_id: venueId,
      requested_date: date,
      requested_time: time,
      requested_party_size: partySize,
      channel,
      guest_name: guestName,
      was_accepted: wasAccepted,
      reservation_id: reservationId,
      rejected_reason: rejectedReason,
    };
    // Typed DB schema in this branch does not include reservation_requests yet.
    await (svc.from('reservation_requests') as any).insert(payload);
  } catch {
    // Non-blocking: don't fail the reservation if demand logging fails
  }
}

/**
 * GET — List reservations for a venue on a date.
 */
export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':reservations');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    const date = request.nextUrl.searchParams.get('date');
    const status = request.nextUrl.searchParams.get('status');

    if (!venueId || !date) {
      return NextResponse.json({ error: 'venue_id and date are required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    let reservations = await getReservationsForVenueDate(venueId, date);

    // Optionally filter by status
    if (status) {
      const statuses = status.split(',');
      reservations = reservations.filter(r => statuses.includes(r.status));
    }

    // Compute summary
    const active = reservations.filter(r => !['cancelled', 'no_show'].includes(r.status));
    const totalCovers = active.reduce((s, r) => s + r.party_size, 0);

    return NextResponse.json({
      success: true,
      reservations,
      summary: {
        total: reservations.length,
        active: active.length,
        total_covers: totalCovers,
        by_status: {
          pending: reservations.filter(r => r.status === 'pending').length,
          confirmed: reservations.filter(r => r.status === 'confirmed').length,
          arrived: reservations.filter(r => r.status === 'arrived').length,
          seated: reservations.filter(r => r.status === 'seated').length,
          completed: reservations.filter(r => r.status === 'completed').length,
          cancelled: reservations.filter(r => r.status === 'cancelled').length,
          no_show: reservations.filter(r => r.status === 'no_show').length,
        },
      },
    });
  });
}

/**
 * POST — Create a new reservation.
 * Enforces access rule pacing limits — returns 409 if slot is full.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':reservations');
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const {
      venue_id,
      first_name,
      last_name,
      party_size,
      business_date,
      arrival_time,
      channel = 'direct',
      external_id,
      ...rest
    } = body;

    if (!venue_id || !business_date || !arrival_time) {
      return NextResponse.json(
        { error: 'venue_id, business_date, and arrival_time are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    // Enforce pacing limits (unless it's a sync from external channel)
    const isSyncChannel = ['sevenrooms', 'resy', 'opentable'].includes(channel);
    if (!isSyncChannel) {
      const rules = await getActiveAccessRulesForDate(venue_id, business_date);

      for (const rule of rules) {
        // Check if arrival time falls within this rule's window
        if (arrival_time >= rule.start_time && arrival_time < rule.end_time) {
          // Check party size
          if (party_size && (party_size < rule.min_party_size || party_size > rule.max_party_size)) {
            logReservationRequest(
              orgId, venue_id, business_date, arrival_time,
              party_size, channel,
              [first_name, last_name].filter(Boolean).join(' ') || null,
              false, null, 'party_too_large',
            );

            return NextResponse.json(
              { error: `Party size ${party_size} outside allowed range ${rule.min_party_size}-${rule.max_party_size}` },
              { status: 400 },
            );
          }

          // Compute slot time for pacing check
          const [h, m] = arrival_time.split(':').map(Number);
          const slotM = Math.floor(m / rule.interval_minutes) * rule.interval_minutes;
          const slotTime = `${String(h).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`;

          const { remaining } = await getRemainingCoversForSlot(
            venue_id, business_date, rule.id, slotTime,
          );

          if (remaining < (party_size || 2)) {
            // Log denied demand
            logReservationRequest(
              orgId, venue_id, business_date, arrival_time,
              party_size || 2, channel,
              [first_name, last_name].filter(Boolean).join(' ') || null,
              false, null, 'slot_full',
            );

            return NextResponse.json(
              {
                error: 'Slot is full',
                slot: slotTime,
                remaining,
                requested: party_size || 2,
              },
              { status: 409 },
            );
          }

          // Derive expected duration from rule turn times
          const turnTimes = rule.turn_times || {};
          const expectedDuration = turnTimes[String(party_size)] || turnTimes['-1'] || 90;
          rest.expected_duration = expectedDuration;

          break; // First matching rule wins
        }
      }
    }

    const reservation = await upsertReservation(orgId, venue_id, {
      first_name: first_name || '',
      last_name: last_name || '',
      party_size: party_size || 2,
      business_date,
      arrival_time,
      channel: channel as ReservationChannel,
      external_id: external_id || null,
      status: 'confirmed',
      ...rest,
    });

    // Log creation event
    await insertReservationEvent({
      reservation_id: reservation.id,
      event_type: 'created',
      to_status: 'confirmed',
      actor_id: user.id,
      actor_type: isSyncChannel ? 'sync' : 'user',
      metadata: { channel },
    });

    // Log accepted demand
    logReservationRequest(
      orgId, venue_id, business_date, arrival_time,
      party_size || 2, channel,
      [first_name, last_name].filter(Boolean).join(' ') || null,
      true, reservation.id, null,
    );

    return NextResponse.json({ success: true, reservation }, { status: 201 });
  });
}
