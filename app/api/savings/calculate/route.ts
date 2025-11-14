import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';

/**
 * Calculate savings from par optimization
 * GET /api/savings/calculate?venue_id=xxx&start_date=xxx&end_date=xxx
 */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!venueId) throw { status: 400, code: 'NO_VENUE', message: 'venue_id is required' };
    if (!startDate) throw { status: 400, code: 'NO_START', message: 'start_date is required' };
    if (!endDate) throw { status: 400, code: 'NO_END', message: 'end_date is required' };

    assertVenueAccess(venueId, venueIds);

    const supabase = await createClient();

    // Calculate par-based savings
    const { data: parSavings, error } = await supabase.rpc('calculate_par_savings', {
      p_venue_id: venueId,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) throw error;

    const totalSavings = parSavings?.reduce((sum: number, item: any) => sum + (item.estimated_savings || 0), 0) || 0;

    return NextResponse.json({
      venue_id: venueId,
      period_start: startDate,
      period_end: endDate,
      total_savings: totalSavings,
      items: parSavings || [],
      summary: {
        items_tracked: parSavings?.length || 0,
        total_savings: totalSavings,
        avg_savings_per_item: parSavings?.length > 0 ? totalSavings / parSavings.length : 0,
      },
    });
  });
}
