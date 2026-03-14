import { NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { fetchVenuesInGroup } from '@/lib/integrations/sevenrooms';

/**
 * GET /api/admin/sevenrooms-venues
 * List all SevenRooms venues in the configured venue group.
 * Use this to discover venue IDs for SEVENROOMS_VENUE_MAP.
 */
export async function GET() {
  return guard(async () => {
    const groupId = process.env.SEVENROOMS_VENUE_GROUP_ID;
    if (!groupId) {
      return NextResponse.json({ error: 'SEVENROOMS_VENUE_GROUP_ID not configured' }, { status: 500 });
    }

    const venues = await fetchVenuesInGroup(groupId);
    return NextResponse.json({ venues, count: venues.length });
  });
}
