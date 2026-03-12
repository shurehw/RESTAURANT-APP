/**
 * Service Notes API
 *
 * GET  /api/floor-plan/notes?venue_id=xxx&date=YYYY-MM-DD[&table_id=xxx][&reservation_id=xxx]
 * POST /api/floor-plan/notes
 *
 * For guest notes: writes back to SevenRooms, then logs locally as audit trail.
 * For service notes: stores in service_notes table only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { createServiceNote, getServiceNotesForVenueDate } from '@/lib/database/service-notes';
import { getReservationById } from '@/lib/database/reservations';
import { updateReservationNotes } from '@/lib/integrations/sevenrooms';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const sp = request.nextUrl.searchParams;
    const venueId = sp.get('venue_id');
    const date = sp.get('date');

    if (!venueId || !date) {
      return NextResponse.json(
        { error: 'venue_id and date are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venueId, venueIds);

    const filters: { table_id?: string; reservation_id?: string } = {};
    if (sp.get('table_id')) filters.table_id = sp.get('table_id')!;
    if (sp.get('reservation_id')) filters.reservation_id = sp.get('reservation_id')!;

    const notes = await getServiceNotesForVenueDate(venueId, date, filters);
    return NextResponse.json({ success: true, notes });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, date, note_type, note_text, table_id, reservation_id } = body;

    if (!venue_id || !date || !note_type || !note_text?.trim()) {
      return NextResponse.json(
        { error: 'venue_id, date, note_type, and note_text are required' },
        { status: 400 },
      );
    }
    if (!['guest', 'service'].includes(note_type)) {
      return NextResponse.json(
        { error: 'note_type must be "guest" or "service"' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    let srWriteStatus: string | undefined;
    let srError: string | undefined;

    // Guest note: attempt SR write-back
    if (note_type === 'guest' && reservation_id) {
      const rez = await getReservationById(reservation_id);
      if (rez && rez.external_id && rez.channel === 'sevenrooms') {
        // Append new note to existing notes with timestamp
        const existingNotes = rez.notes || '';
        const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const separator = existingNotes ? '\n' : '';
        const combinedNotes = `${existingNotes}${separator}[${timestamp}] ${note_text.trim()}`;

        const result = await updateReservationNotes(rez.external_id, combinedNotes);
        srWriteStatus = result.status;
        srError = result.success ? undefined : result.message;

        console.log(
          `[floor-plan/notes] SR write-back: ${result.status} for rez ${reservation_id}`,
        );
      } else {
        srWriteStatus = 'unsupported';
        srError = 'Reservation not linked to SevenRooms';
      }
    } else if (note_type === 'guest' && !reservation_id) {
      srWriteStatus = 'unsupported';
      srError = 'No reservation linked — guest note saved locally only';
    }

    // Always store locally (audit trail for guest notes, primary store for service notes)
    const note = await createServiceNote(orgId, venue_id, {
      business_date: date,
      table_id,
      reservation_id,
      note_type,
      note_text: note_text.trim(),
      author_id: user.id,
      author_name: user.email || undefined,
      sr_write_status: srWriteStatus,
      sr_error: srError,
    });

    return NextResponse.json(
      {
        success: true,
        note,
        sr_write:
          note_type === 'guest'
            ? { status: srWriteStatus, error: srError }
            : undefined,
      },
      { status: 201 },
    );
  });
}
