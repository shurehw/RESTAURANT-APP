/**
 * Demand Calendar API
 *
 * GET /api/reservations/demand-calendar?venue_id=xxx&date=YYYY-MM-DD
 *     Returns demand calendar entry for a venue/date.
 *     Returns 204 if no entry exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { getDemandCalendarEntry } from '@/lib/database/demand-calendar';

export async function GET(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':demand-calendar');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    const date = request.nextUrl.searchParams.get('date');

    if (!venueId || !date) {
      return NextResponse.json(
        { error: 'venue_id and date are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venueId, venueIds);

    const entry = await getDemandCalendarEntry(venueId, date);

    if (!entry) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(entry);
  });
}
