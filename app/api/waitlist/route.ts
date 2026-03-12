/**
 * Waitlist API
 *
 * GET  /api/waitlist?venue_id=xxx&date=YYYY-MM-DD — Active waitlist
 * POST /api/waitlist — Add party to waitlist
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getActiveWaitlist, addToWaitlist } from '@/lib/database/floor-management';

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

    const entries = await getActiveWaitlist(venueId, date);
    return NextResponse.json({ success: true, entries });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, guest_name, party_size, phone, date, quoted_wait, notes, seating_preference } = body;

    if (!venue_id || !guest_name || !party_size || !date) {
      return NextResponse.json(
        { error: 'venue_id, guest_name, party_size, and date are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    const entry = await addToWaitlist(orgId, venue_id, {
      guest_name,
      party_size,
      phone,
      business_date: date,
      quoted_wait,
      notes,
      seating_preference,
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  });
}
