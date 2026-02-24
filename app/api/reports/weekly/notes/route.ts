/**
 * Weekly GM Notes API
 *
 * GET  /api/reports/weekly/notes?venue_id=UUID&week_start=YYYY-MM-DD
 * PUT  /api/reports/weekly/notes  { venue_id, week_start, notes: GmNotesInput }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { getWeeklyGmNotes, upsertWeeklyGmNotes } from '@/lib/database/weekly-gm-notes';
import type { GmNotesInput } from '@/lib/database/weekly-gm-notes';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    const weekStart = searchParams.get('week_start');

    if (!venueId || !weekStart) {
      return NextResponse.json(
        { error: 'venue_id and week_start are required' },
        { status: 400 },
      );
    }

    const notes = await getWeeklyGmNotes(venueId, weekStart);
    return NextResponse.json({ notes });
  } catch (err: any) {
    console.error('[weekly-notes GET] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { venue_id, week_start, notes } = body as {
      venue_id: string;
      week_start: string;
      notes: GmNotesInput;
    };

    if (!venue_id || !week_start || !notes) {
      return NextResponse.json(
        { error: 'venue_id, week_start, and notes are required' },
        { status: 400 },
      );
    }

    const saved = await upsertWeeklyGmNotes(venue_id, week_start, notes);
    return NextResponse.json({ notes: saved });
  } catch (err: any) {
    console.error('[weekly-notes PUT] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
