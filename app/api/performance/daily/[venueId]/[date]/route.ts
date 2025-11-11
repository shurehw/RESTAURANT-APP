/**
 * GET /api/performance/daily/[venueId]/[date]
 * Returns daily P&L performance with variance and alerts
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

    // Get daily performance from materialized view
    const { data: performance, error: perfError } = await supabase
      .from('daily_performance')
      .select('*')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .single();

    if (perfError && perfError.code !== 'PGRST116') {
      throw perfError;
    }

    // Get variance (actual vs budget)
    const { data: variance, error: varError } = await supabase
      .from('daily_variance')
      .select('*')
      .eq('venue_id', venueId)
      .eq('business_date', date)
      .single();

    if (varError && varError.code !== 'PGRST116') {
      throw varError;
    }

    // Get unacknowledged alerts for this venue and date
    const { data: alerts, error: alertsError } = await supabase
      .from('alerts')
      .select('*')
      .eq('venue_id', venueId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`)
      .eq('acknowledged', false)
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false });

    if (alertsError) {
      throw alertsError;
    }

    // Get hourly breakdown
    const { data: hourly, error: hourlyError } = await supabase
      .from('labor_efficiency_hourly')
      .select('*')
      .eq('venue_id', venueId)
      .gte('hour', `${date}T00:00:00`)
      .lte('hour', `${date}T23:59:59`)
      .order('hour', { ascending: true });

    if (hourlyError) {
      throw hourlyError;
    }

    return NextResponse.json({
      success: true,
      data: {
        performance: performance || null,
        variance: variance || null,
        alerts: alerts || [],
        hourly: hourly || [],
        date,
        venueId,
      },
    });
  });
}
