/**
 * GET /api/labor/efficiency/[venueId]/[date]
 * Returns labor efficiency metrics for a specific venue and date
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { assertVenueAccess, getUserOrgAndVenues } from '@/lib/tenant';
import { z } from 'zod';

const paramsSchema = z.object({
  venueId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ venueId: string; date: string }> }
) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { venueId, date } = paramsSchema.parse(await params);

    assertVenueAccess(venueId, venueIds);

    const supabase = await createClient();

    // Get daily labor efficiency
    const { data: dailyEfficiency, error: dailyError } = await supabase
      .from('labor_efficiency_daily')
      .select('*')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .single();

    if (dailyError && dailyError.code !== 'PGRST116') {
      throw dailyError;
    }

    // Get hourly breakdown
    const { data: hourlyEfficiency, error: hourlyError } = await supabase
      .from('labor_efficiency_hourly')
      .select('*')
      .eq('venue_id', venueId)
      .gte('hour', `${date}T00:00:00`)
      .lte('hour', `${date}T23:59:59`)
      .order('hour', { ascending: true });

    if (hourlyError) {
      throw hourlyError;
    }

    // Get shift assignments for the day
    const { data: shifts, error: shiftsError } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        position:positions(name, hourly_rate),
        user:auth.users(email)
      `)
      .eq('venue_id', venueId)
      .gte('shift_start', `${date}T00:00:00`)
      .lte('shift_start', `${date}T23:59:59`)
      .order('shift_start', { ascending: true });

    if (shiftsError) {
      throw shiftsError;
    }

    return NextResponse.json({
      success: true,
      data: {
        daily: dailyEfficiency || null,
        hourly: hourlyEfficiency || [],
        shifts: shifts || [],
        date,
        venueId,
      },
    });
  });
}
