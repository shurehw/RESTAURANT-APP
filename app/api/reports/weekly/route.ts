/**
 * Weekly Agenda API
 *
 * GET /api/reports/weekly?venue_id=UUID&week_start=YYYY-MM-DD
 *
 * Returns a WeeklyAgendaPayload with 7 days of revenue, labor,
 * enforcement, and attestation insight data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { buildWeeklyAgenda } from '@/lib/database/weekly-agenda';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const venueId = searchParams.get('venue_id');
  const weekStart = searchParams.get('week_start');

  if (!venueId || !weekStart) {
    return NextResponse.json(
      { error: 'venue_id and week_start are required' },
      { status: 400 },
    );
  }

  // Validate week_start is a Monday
  const startDate = new Date(weekStart + 'T12:00:00Z');
  if (isNaN(startDate.getTime())) {
    return NextResponse.json(
      { error: 'week_start must be a valid date (YYYY-MM-DD)' },
      { status: 400 },
    );
  }
  if (startDate.getUTCDay() !== 1) {
    return NextResponse.json(
      { error: 'week_start must be a Monday' },
      { status: 400 },
    );
  }

  // Compute week end (Sunday)
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const weekEnd = endDate.toISOString().split('T')[0];

  try {
    const supabase = getServiceClient();

    // Look up venue name + org_id
    const { data: venue, error: venueErr } = await (supabase as any)
      .from('venues')
      .select('name, organization_id')
      .eq('id', venueId)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json(
        { error: 'Venue not found' },
        { status: 404 },
      );
    }

    const payload = await buildWeeklyAgenda(
      venueId,
      weekStart,
      weekEnd,
      venue.organization_id,
      venue.name,
    );

    return NextResponse.json({ payload });
  } catch (err: any) {
    console.error('[weekly-agenda] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
