/**
 * Sales Pace Dashboard API
 *
 * GET /api/sales/pace?venue_id=xxx&date=YYYY-MM-DD
 *
 * Returns current snapshot, all snapshots for charting, forecast comparison,
 * SDLW comparison, and computed pace status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getSnapshotsForDate,
  getLatestSnapshot,
  getForecastForDate,
  getSDLWFacts,
  getSalesPaceSettings,
  computeProjectedEOD,
  computePaceStatus,
} from '@/lib/database/sales-pace';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const venueId = request.nextUrl.searchParams.get('venue_id');
  const date = request.nextUrl.searchParams.get('date') || getBusinessDate();

  if (!venueId) {
    return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
  }

  try {
    const [settings, snapshots, latest, forecast, sdlw] = await Promise.all([
      getSalesPaceSettings(venueId),
      getSnapshotsForDate(venueId, date),
      getLatestSnapshot(venueId, date),
      getForecastForDate(venueId, date),
      getSDLWFacts(venueId, date),
    ]);

    // Compute pace metrics
    const startHour = settings?.service_start_hour ?? 11;
    const endHour = settings?.service_end_hour ?? 3;

    const currentNetSales = latest?.net_sales ?? 0;
    const currentCovers = latest?.covers_count ?? 0;

    const projectedRevenue = currentNetSales > 0
      ? computeProjectedEOD(currentNetSales, startHour, endHour)
      : 0;
    const projectedCovers = currentCovers > 0
      ? computeProjectedEOD(currentCovers, startHour, endHour)
      : 0;

    const revenueTarget = forecast?.revenue_predicted ?? sdlw?.net_sales ?? 0;
    const coversTarget = forecast?.covers_predicted ?? sdlw?.covers_count ?? 0;

    const revenueStatus = computePaceStatus(projectedRevenue, revenueTarget, settings);
    const coversStatus = computePaceStatus(projectedCovers, coversTarget, settings);

    // Overall status = worst of the two
    const statusPriority: Record<string, number> = { critical: 3, warning: 2, on_pace: 1, no_target: 0 };
    const overallStatus = statusPriority[revenueStatus] >= statusPriority[coversStatus]
      ? revenueStatus
      : coversStatus;

    return NextResponse.json({
      current: latest,
      snapshots,
      forecast,
      sdlw,
      settings: settings ? {
        service_start_hour: settings.service_start_hour,
        service_end_hour: settings.service_end_hour,
        pace_warning_pct: settings.pace_warning_pct,
        pace_critical_pct: settings.pace_critical_pct,
      } : null,
      pace: {
        revenue_pct: revenueTarget > 0 ? Math.round((currentNetSales / revenueTarget) * 100) : null,
        covers_pct: coversTarget > 0 ? Math.round((currentCovers / coversTarget) * 100) : null,
        projected_revenue: projectedRevenue,
        projected_covers: projectedCovers,
        revenue_target: revenueTarget,
        covers_target: coversTarget,
        revenue_status: revenueStatus,
        covers_status: coversStatus,
        status: overallStatus,
      },
    });
  } catch (error: any) {
    console.error('Sales pace API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pace data' },
      { status: 500 }
    );
  }
}

function getBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}
