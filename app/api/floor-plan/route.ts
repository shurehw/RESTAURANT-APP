import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getFloorPlanForVenue } from '@/lib/database/floor-plan';

/** GET - Full floor plan (sections + tables + optional staff assignments) */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const sp = request.nextUrl.searchParams;
    const venueId = sp.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const date = sp.get('date') || undefined;
    const shiftType = sp.get('shift_type') || undefined;

    const floorPlan = await getFloorPlanForVenue(venueId, date, shiftType);
    return NextResponse.json(floorPlan);
  });
}
