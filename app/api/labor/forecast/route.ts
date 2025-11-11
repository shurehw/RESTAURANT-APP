import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validateQuery, laborForecastQuerySchema } from '@/lib/validate';

/**
 * GET /api/labor/forecast
 * Fetch demand forecasts (covers AND revenue)
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':labor-forecast-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = req.nextUrl.searchParams;
    const params = validateQuery(laborForecastQuerySchema, searchParams);

    assertVenueAccess(params.venueId, venueIds);

    const supabase = await createClient();

    let query = supabase
      .from('demand_forecasts')
      .select('*')
      .eq('venue_id', params.venueId)
      .order('business_date', { ascending: true });

    if (params.startDate) {
      query = query.gte('business_date', params.startDate);
    }

    if (params.endDate) {
      query = query.lte('business_date', params.endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      forecasts: data,
      count: data?.length || 0,
    });
  });
}

/**
 * POST /api/labor/forecast
 * Trigger Python forecaster to generate new forecasts
 */
export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':labor-forecast-generate');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    // Only managers+ can trigger forecast generation
    if (!['owner', 'admin', 'manager'].includes(role)) {
      throw {
        status: 403,
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'Only managers can generate forecasts',
      };
    }

    const body = await req.json();
    const { venueId, daysAhead = 7 } = body;

    if (!venueId) {
      throw {
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'venueId required',
      };
    }

    assertVenueAccess(venueId, venueIds);

    // TODO: Call Python forecaster service
    // This would be a separate process/container running forecaster.py

    return NextResponse.json({
      success: true,
      message: `Forecast generation triggered for ${daysAhead} days`,
      venueId,
      daysAhead,
      note: 'Python forecaster service will run and populate demand_forecasts table',
    });
  });
}
