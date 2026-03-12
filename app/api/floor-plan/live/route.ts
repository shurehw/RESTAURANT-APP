/**
 * Live Floor State API
 *
 * GET /api/floor-plan/live?venue_id=xxx&date=YYYY-MM-DD
 *
 * Returns the full floor plan overlaid with live table statuses.
 * Used by the host stand page and live service mode in the floor plan editor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getSectionsForVenue, getLabelsForVenue } from '@/lib/database/floor-plan';
import { getTableStatusForVenue } from '@/lib/database/floor-management';
import { getReservationsForVenueDate } from '@/lib/database/reservations';

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

    // Fetch floor plan + live statuses + upcoming reservations in parallel
    const [sections, labels, tableStatuses, reservations] = await Promise.all([
      getSectionsForVenue(venueId),
      getLabelsForVenue(venueId),
      getTableStatusForVenue(venueId, date),
      getReservationsForVenueDate(venueId, date),
    ]);

    // Helper to map reservation to API shape
    const mapRez = (r: typeof reservations[number]) => ({
      id: r.id,
      guest_name: `${r.first_name} ${r.last_name}`.trim(),
      party_size: r.party_size,
      arrival_time: r.arrival_time,
      status: r.status,
      is_vip: r.is_vip,
      table_ids: r.table_ids,
      notes: r.notes,
      client_requests: r.client_requests,
    });

    // Upcoming: confirmed/pending + arrived (not yet seated)
    const upcoming = reservations
      .filter(r => ['confirmed', 'pending', 'arrived'].includes(r.status))
      .sort((a, b) => a.arrival_time.localeCompare(b.arrival_time))
      .map(mapRez);

    // Seated: from reservations (SR knows who's seated)
    const seated = reservations
      .filter(r => r.status === 'seated')
      .sort((a, b) => a.arrival_time.localeCompare(b.arrival_time))
      .map(mapRez);

    // Completed
    const completed = reservations
      .filter(r => r.status === 'completed')
      .map(mapRez);

    // No-shows
    const noShows = reservations
      .filter(r => r.status === 'no_show')
      .map(mapRez);

    // Cancelled
    const cancelled = reservations
      .filter(r => r.status === 'cancelled')
      .map(mapRez);

    return NextResponse.json({
      success: true,
      sections,
      labels,
      tables: tableStatuses,
      upcoming,
      seated_reservations: seated,
      completed,
      no_shows: noShows,
      cancelled,
    });
  });
}
