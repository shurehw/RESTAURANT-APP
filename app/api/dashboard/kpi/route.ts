/**
 * GET /api/dashboard/kpi?venue_id=xxx
 *
 * Returns today's KPI snapshot for the hero row:
 * covers forecast, revenue pace, reservations count.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getCoversForecast } from '@/lib/database/preshift';
import { getLatestSnapshot } from '@/lib/database/sales-pace';
import { getServiceClient } from '@/lib/supabase/service';

function getBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const venueId = new URL(request.url).searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }

    const date = getBusinessDate();

    const [coversForecast, salesSnapshot, rezCount] = await Promise.all([
      getCoversForecast(venueId, date).catch(() => null),
      getLatestSnapshot(venueId, date).catch(() => null),
      (async () => {
        try {
          const supabase = getServiceClient() as any;
          const { count } = await supabase
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .eq('venue_id', venueId)
            .eq('business_date', date)
            .in('status', ['confirmed', 'booked', 'seated']);
          return count || 0;
        } catch {
          return 0;
        }
      })(),
    ]);

    return NextResponse.json({
      business_date: date,
      covers_forecast: coversForecast,
      net_sales: salesSnapshot?.net_sales ?? null,
      covers_actual: salesSnapshot?.covers_count ?? null,
      reservations: rezCount,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: err.status || 500 },
    );
  }
}
