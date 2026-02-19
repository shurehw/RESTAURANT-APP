/**
 * Interval Forecasts API
 * GET /api/forecast/intervals?venueId=...&startDate=...&endDate=...
 *
 * Returns 30-minute interval forecasts by distributing daily forecasts
 * across historical demand curves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const querySchema = z.object({
  venueId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-intervals');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const params = querySchema.parse(
      Object.fromEntries(req.nextUrl.searchParams)
    );
    assertVenueAccess(params.venueId, venueIds);

    const supabase = await createClient();

    // Call the SQL function that joins forecasts_with_bias × demand_distribution_curves
    const { data, error } = await supabase.rpc('get_interval_forecasts', {
      p_venue_id: params.venueId,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
    });

    if (error) {
      console.error('[forecast-intervals] RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by business_date for easier UI consumption
    const byDate: Record<string, any[]> = {};
    for (const row of data || []) {
      const key = row.business_date;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(row);
    }

    return NextResponse.json({
      intervals: byDate,
      total_dates: Object.keys(byDate).length,
    });
  });
}
