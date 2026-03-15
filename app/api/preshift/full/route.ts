/**
 * Preshift Full Briefing API
 *
 * GET /api/preshift/full?venue_id=xxx&date=YYYY-MM-DD
 *
 * Aggregates all preshift data in a single parallel call:
 * - Manager notes, covers forecast, VIPs, large parties,
 *   reviews, 86'd items, demand calendar, enforcement carry-forward
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import {
  getPreshiftNotes,
  getCoversForecast,
  getVipReservations,
  getLargeParties,
  getRecentReviews,
  getPreviousNight86Items,
} from '@/lib/database/preshift';
import { getDemandCalendarEntry } from '@/lib/database/demand-calendar';
import { getPreshiftSummary } from '@/lib/enforcement/carry-forward';

export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');

    if (!venueId) {
      return NextResponse.json(
        { error: 'venue_id is required' },
        { status: 400 },
      );
    }

    // Compute business date (before 5 AM = previous day)
    const dateParam = searchParams.get('date');
    let businessDate: string;

    if (dateParam) {
      businessDate = dateParam;
    } else {
      const now = new Date();
      if (now.getHours() < 5) {
        now.setDate(now.getDate() - 1);
      }
      businessDate = now.toISOString().split('T')[0];
    }

    // Run all queries in parallel
    const [
      notes,
      coversForecast,
      vipReservations,
      largeParties,
      recentReviews,
      eightySixedItems,
      demandCalendar,
      enforcementSummary,
    ] = await Promise.all([
      getPreshiftNotes(venueId, businessDate),
      getCoversForecast(venueId, businessDate),
      getVipReservations(venueId, businessDate),
      getLargeParties(venueId, businessDate),
      getRecentReviews(venueId),
      getPreviousNight86Items(venueId, businessDate),
      getDemandCalendarEntry(venueId, businessDate).catch(() => null),
      getPreshiftSummary(venueId, businessDate).catch(() => null),
    ]);

    return NextResponse.json({
      success: true,
      business_date: businessDate,
      notes,
      covers_forecast: coversForecast,
      vip_reservations: vipReservations,
      large_parties: largeParties,
      recent_reviews: recentReviews,
      eighty_sixed_items: eightySixedItems,
      demand_calendar: demandCalendar,
      enforcement_summary: enforcementSummary,
    });
  } catch (err: any) {
    console.error('[Preshift Full API]', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: err.status || 500 },
    );
  }
}
