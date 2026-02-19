/**
 * Reservation List API
 *
 * GET /api/sales/reservations?venue_id=xxx&date=YYYY-MM-DD
 * Returns SevenRooms reservation data from TipSee's full_reservations table.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';
import { fetchReservationsForDate } from '@/lib/database/tipsee';

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
    if (locationUuids.length === 0) {
      return NextResponse.json({
        reservations: [],
        total: 0,
        message: 'No TipSee mapping for this venue',
      });
    }

    const { reservations, total } = await fetchReservationsForDate(locationUuids, date);
    return NextResponse.json({ reservations, total });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch reservations';
    console.error('Reservations API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
