import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const forecastQuerySchema = z.object({
  venueId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  forecastType: z.enum(['net_sales', 'covers']).optional(),
  futureOnly: z.coerce.boolean().optional().default(true),
});

/**
 * GET /api/forecast
 * Fetch Prophet forecasts for net_sales and covers
 *
 * Query params:
 *   venueId: required - venue UUID
 *   startDate: optional - YYYY-MM-DD (default: today)
 *   endDate: optional - YYYY-MM-DD (default: 42 days out)
 *   forecastType: optional - 'net_sales' | 'covers' (default: both)
 *   futureOnly: optional - only return future dates (default: true)
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const params = forecastQuerySchema.parse(searchParams);

    assertVenueAccess(params.venueId, venueIds);

    const supabase = await createClient();
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('venue_day_forecast')
      .select('*')
      .eq('venue_id', params.venueId)
      .order('business_date', { ascending: true })
      .order('forecast_type', { ascending: true });

    // Filter by forecast type
    if (params.forecastType) {
      query = query.eq('forecast_type', params.forecastType);
    }

    // Date range
    if (params.futureOnly && !params.startDate) {
      query = query.gte('business_date', today);
    } else if (params.startDate) {
      query = query.gte('business_date', params.startDate);
    }

    if (params.endDate) {
      query = query.lte('business_date', params.endDate);
    }

    // Get latest model version
    query = query.order('generated_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    // Group by date for easier consumption
    const forecastsByDate: Record<string, {
      business_date: string;
      net_sales?: { yhat: number; yhat_lower: number; yhat_upper: number };
      covers?: { yhat: number; yhat_lower: number; yhat_upper: number };
    }> = {};

    for (const row of data || []) {
      const date = row.business_date;
      if (!forecastsByDate[date]) {
        forecastsByDate[date] = { business_date: date };
      }

      const forecastData = {
        yhat: row.yhat,
        yhat_lower: row.yhat_lower,
        yhat_upper: row.yhat_upper,
      };

      if (row.forecast_type === 'net_sales') {
        forecastsByDate[date].net_sales = forecastData;
      } else if (row.forecast_type === 'covers') {
        forecastsByDate[date].covers = forecastData;
      }
    }

    const forecasts = Object.values(forecastsByDate).sort(
      (a, b) => a.business_date.localeCompare(b.business_date)
    );

    return NextResponse.json({
      venueId: params.venueId,
      forecasts,
      count: forecasts.length,
    });
  });
}
