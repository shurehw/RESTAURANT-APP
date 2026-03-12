/**
 * Live Floor Summary API
 *
 * GET /api/floor-plan/live/summary?venue_id=xxx&date=YYYY-MM-DD
 *
 * Returns aggregate live floor metrics: table counts by status,
 * total covers, revenue, turn stats, and waitlist count.
 * Lightweight endpoint for dashboard widgets and status bars.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getLiveFloorSummary } from '@/lib/database/floor-management';

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

    const summary = await getLiveFloorSummary(venueId, date);
    return NextResponse.json({ success: true, ...summary });
  });
}
