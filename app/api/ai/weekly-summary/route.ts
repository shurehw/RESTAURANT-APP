/**
 * Weekly Executive Summary AI API
 *
 * POST /api/ai/weekly-summary
 * Body: { venue_id: string, week_start: string }
 *
 * Builds the WeeklyAgendaPayload and passes it to Claude
 * for a structured executive narrative.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { buildWeeklyAgenda } from '@/lib/database/weekly-agenda';
import { generateWeeklyNarrative } from '@/lib/ai/weekly-narrator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { venue_id, week_start } = body;

    if (!venue_id || !week_start) {
      return NextResponse.json(
        { error: 'venue_id and week_start are required' },
        { status: 400 },
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI not configured (missing ANTHROPIC_API_KEY)' },
        { status: 503 },
      );
    }

    // Validate week_start is a Monday
    const startDate = new Date(week_start + 'T12:00:00Z');
    if (isNaN(startDate.getTime()) || startDate.getUTCDay() !== 1) {
      return NextResponse.json(
        { error: 'week_start must be a valid Monday (YYYY-MM-DD)' },
        { status: 400 },
      );
    }

    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    const supabase = getServiceClient();

    // Look up venue
    const { data: venue, error: venueErr } = await (supabase as any)
      .from('venues')
      .select('name, organization_id')
      .eq('id', venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json(
        { error: 'Venue not found' },
        { status: 404 },
      );
    }

    // Build data payload
    const payload = await buildWeeklyAgenda(
      venue_id,
      week_start,
      weekEnd,
      venue.organization_id,
      venue.name,
    );

    // Generate AI narrative
    const narrative = await generateWeeklyNarrative(payload);

    return NextResponse.json({
      narrative,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[weekly-summary] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
