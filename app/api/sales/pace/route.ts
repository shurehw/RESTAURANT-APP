/**
 * Sales Pace Dashboard API
 *
 * GET /api/sales/pace?venue_id=xxx&date=YYYY-MM-DD  — single venue
 * GET /api/sales/pace?venue_id=all&date=YYYY-MM-DD  — group-wide summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import {
  getSnapshotsForDate,
  getLatestSnapshot,
  getForecastForDate,
  getSDLWFacts,
  getSalesPaceSettings,
  getActiveSalesPaceVenues,
  computeProjectedEOD,
  computePaceStatus,
  getVenueTimezone,
  getBusinessDateForTimezone,
  getNowInTimezone,
} from '@/lib/database/sales-pace';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const userId = user?.id || cookieStore.get('user_id')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const venueId = request.nextUrl.searchParams.get('venue_id');

  if (!venueId) {
    return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
  }

  // Group-wide view
  if (venueId === 'all') {
    return handleGroupView(request);
  }

  // Use venue timezone for business date
  const tz = await getVenueTimezone(venueId);
  const date = request.nextUrl.searchParams.get('date') || getBusinessDateForTimezone(tz);

  try {
    const result = await buildVenuePace(venueId, date, tz);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Sales pace API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pace data' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SINGLE VENUE
// ══════════════════════════════════════════════════════════════════════════

async function buildVenuePace(venueId: string, date: string, tz: string) {
  const [settings, snapshots, latest, forecast, sdlw] = await Promise.all([
    getSalesPaceSettings(venueId),
    getSnapshotsForDate(venueId, date),
    getLatestSnapshot(venueId, date),
    getForecastForDate(venueId, date),
    getSDLWFacts(venueId, date),
  ]);

  const startHour = settings?.service_start_hour ?? 11;
  const endHour = settings?.service_end_hour ?? 3;
  const venueNow = getNowInTimezone(tz);

  const currentNetSales = latest?.net_sales ?? 0;
  const currentCovers = latest?.covers_count ?? 0;

  const projectedRevenue = currentNetSales > 0
    ? computeProjectedEOD(currentNetSales, startHour, endHour, venueNow)
    : 0;
  const projectedCovers = currentCovers > 0
    ? computeProjectedEOD(currentCovers, startHour, endHour, venueNow)
    : 0;

  const revenueTarget = forecast?.revenue_predicted ?? sdlw?.net_sales ?? 0;
  const coversTarget = forecast?.covers_predicted ?? sdlw?.covers_count ?? 0;

  const revenueStatus = computePaceStatus(projectedRevenue, revenueTarget, settings);
  const coversStatus = computePaceStatus(projectedCovers, coversTarget, settings);

  const statusPriority: Record<string, number> = { critical: 3, warning: 2, on_pace: 1, no_target: 0 };
  const overallStatus = statusPriority[revenueStatus] >= statusPriority[coversStatus]
    ? revenueStatus
    : coversStatus;

  return {
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
  };
}

// ══════════════════════════════════════════════════════════════════════════
// GROUP-WIDE VIEW
// ══════════════════════════════════════════════════════════════════════════

async function handleGroupView(request: NextRequest) {
  try {
    const activeVenues = await getActiveSalesPaceVenues();
    if (activeVenues.length === 0) {
      return NextResponse.json({ venues: [] });
    }

    // Look up venue names
    const svc = getServiceClient();
    const venueIds = activeVenues.map(v => v.venue_id);
    const { data: venueRows } = await (svc as any)
      .from('venues')
      .select('id, name, timezone')
      .in('id', venueIds);

    const venueMap = new Map((venueRows || []).map((v: any) => [v.id, v]));

    // Default date from first venue's timezone (all are similar enough)
    const firstTz = venueMap.get(venueIds[0])?.timezone || 'America/Los_Angeles';
    const date = request.nextUrl.searchParams.get('date') || getBusinessDateForTimezone(firstTz);

    // Fetch pace data for all venues in parallel
    const results = await Promise.allSettled(
      activeVenues.map(async (v) => {
        const venue = venueMap.get(v.venue_id);
        const tz = venue?.timezone || 'America/Los_Angeles';
        const pace = await buildVenuePace(v.venue_id, date, tz);
        return {
          venue_id: v.venue_id,
          venue_name: venue?.name || v.venue_id,
          ...pace,
        };
      })
    );

    const venues = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .map(r => r.value);

    // Compute group totals
    const totals = {
      net_sales: venues.reduce((sum, v) => sum + (v.current?.net_sales ?? 0), 0),
      covers: venues.reduce((sum, v) => sum + (v.current?.covers_count ?? 0), 0),
      checks: venues.reduce((sum, v) => sum + (v.current?.checks_count ?? 0), 0),
      food_sales: venues.reduce((sum, v) => sum + (v.current?.food_sales ?? 0), 0),
      beverage_sales: venues.reduce((sum, v) => sum + (v.current?.beverage_sales ?? 0), 0),
      revenue_target: venues.reduce((sum, v) => sum + (v.pace?.revenue_target ?? 0), 0),
      covers_target: venues.reduce((sum, v) => sum + (v.pace?.covers_target ?? 0), 0),
      sdlw_net: venues.reduce((sum, v) => sum + (v.sdlw?.net_sales ?? 0), 0),
    };

    return NextResponse.json({ date, venues, totals });
  } catch (error: any) {
    console.error('Group pace API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch group pace data' },
      { status: 500 }
    );
  }
}

