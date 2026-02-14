/**
 * Portfolio Rollup API
 *
 * GET /api/portfolio/rollup?date=YYYY-MM-DD
 *   Returns portfolio-level + venue-level enforcement rollups for the Home page.
 *   Auth via Supabase session or legacy cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getPortfolioRollup,
  getVenueRollups,
  getLatestRollupDate,
} from '@/lib/database/portfolio-rollups';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { orgId } = await getUserOrgAndVenues(user.id);

    const dateParam = request.nextUrl.searchParams.get('date');
    const date = dateParam || await getLatestRollupDate(orgId);

    const [portfolio, venues] = await Promise.all([
      getPortfolioRollup(orgId, date),
      getVenueRollups(orgId, date),
    ]);

    // Enrich venue rollups with names
    let venueNames: Record<string, string> = {};
    if (venues.length > 0) {
      const supabase = getServiceClient();
      const { data: venueRows } = await (supabase as any)
        .from('venues')
        .select('id, name')
        .in('id', venues.map(v => v.venue_id));
      if (venueRows) {
        venueNames = Object.fromEntries(
          venueRows.map((v: any) => [v.id, v.name])
        );
      }
    }

    const enrichedVenues = venues.map(v => ({
      ...v,
      venue_name: venueNames[v.venue_id!] || v.venue_id,
    }));

    return NextResponse.json({
      date,
      portfolio,
      venues: enrichedVenues,
      has_data: portfolio !== null,
    });
  } catch (err: any) {
    if (err?.status === 401) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (err?.status === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[portfolio/rollup] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch rollup data' },
      { status: 500 }
    );
  }
}
