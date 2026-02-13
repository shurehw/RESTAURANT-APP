/**
 * Greeting Metrics API
 *
 * GET /api/cv/metrics?venue_id=xxx&date=YYYY-MM-DD — Metrics for a date
 * GET /api/cv/metrics?venue_id=xxx&start_date=...&end_date=... — Stats over range
 * GET /api/cv/metrics?venue_id=xxx&pending=true — Currently waiting greetings
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import {
  getGreetingMetricsByDate,
  getPendingGreetings,
  getGreetingStats,
  getGreetingSettings,
} from '@/lib/database/greeting-metrics';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const params = request.nextUrl.searchParams;
    const venueId = params.get('venue_id');

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }

    // Pending greetings (real-time view)
    if (params.get('pending') === 'true') {
      const pending = await getPendingGreetings(venueId);
      return NextResponse.json({ success: true, data: pending });
    }

    // Stats over date range
    const startDate = params.get('start_date');
    const endDate = params.get('end_date');
    if (startDate && endDate) {
      const settings = await getGreetingSettings(venueId);
      const stats = await getGreetingStats(venueId, startDate, endDate, settings);
      return NextResponse.json({ success: true, data: stats });
    }

    // Single date metrics
    const date = params.get('date');
    if (!date) {
      return NextResponse.json(
        { error: 'date, start_date+end_date, or pending=true is required' },
        { status: 400 }
      );
    }

    const metrics = await getGreetingMetricsByDate(venueId, date);
    const settings = await getGreetingSettings(venueId);

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        settings,
        summary: {
          total: metrics.length,
          greeted: metrics.filter((m) => m.status === 'greeted').length,
          waiting: metrics.filter((m) => m.status === 'waiting').length,
          expired: metrics.filter((m) => m.status === 'expired').length,
        },
      },
    });
  });
}
