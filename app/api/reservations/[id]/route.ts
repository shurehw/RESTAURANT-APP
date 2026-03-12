/**
 * Single Reservation API
 *
 * PATCH /api/reservations/[id] — Update reservation fields
 * POST  /api/reservations/[id] — Status transition (arrived, seated, cancelled, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import {
  getReservationById,
  updateReservation,
  transitionReservationStatus,
  type ReservationStatus,
} from '@/lib/database/reservations';

/**
 * PATCH — Update reservation fields (table assignment, notes, party size, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    rateLimit(request, ':reservations');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const { id } = await params;

    const rez = await getReservationById(id);
    if (!rez) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      first_name, last_name, email, phone, party_size,
      arrival_time, expected_duration, table_ids, section_id,
      server_id, is_vip, tags, notes, client_requests, min_spend,
    } = body;

    const updates: Record<string, unknown> = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (party_size !== undefined) updates.party_size = party_size;
    if (arrival_time !== undefined) updates.arrival_time = arrival_time;
    if (expected_duration !== undefined) updates.expected_duration = expected_duration;
    if (table_ids !== undefined) updates.table_ids = table_ids;
    if (section_id !== undefined) updates.section_id = section_id;
    if (server_id !== undefined) updates.server_id = server_id;
    if (is_vip !== undefined) updates.is_vip = is_vip;
    if (tags !== undefined) updates.tags = tags;
    if (notes !== undefined) updates.notes = notes;
    if (client_requests !== undefined) updates.client_requests = client_requests;
    if (min_spend !== undefined) updates.min_spend = min_spend;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await updateReservation(id, updates as any);
    if (!updated) {
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, reservation: updated });
  });
}

/**
 * POST — Status transition.
 * Body: { action: 'arrived' | 'seated' | 'cancelled' | 'no_show' | 'completed' | 'confirmed' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return guard(async () => {
    rateLimit(request, ':reservations');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const { id } = await params;

    const body = await request.json();
    const { action, metadata } = body;

    const validActions: ReservationStatus[] = [
      'pending', 'confirmed', 'waitlisted', 'arrived',
      'seated', 'no_show', 'cancelled', 'completed',
    ];

    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${validActions.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await transitionReservationStatus(
      id,
      action as ReservationStatus,
      user.id,
      'user',
      metadata || {},
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  });
}
