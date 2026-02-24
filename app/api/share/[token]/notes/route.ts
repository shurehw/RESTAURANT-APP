/**
 * Share Token Notes API
 *
 * PUT /api/share/[token]/notes
 * Body: { notes: GmNotesInput }
 *
 * Public endpoint — no login required.
 * Saves GM notes for the venue+week associated with the share token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/lib/database/weekly-share';
import { upsertWeeklyGmNotes } from '@/lib/database/weekly-gm-notes';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const validated = await validateShareToken(token);

    if (!validated) {
      return NextResponse.json(
        { error: 'Invalid or expired share link' },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { notes } = body;

    if (!notes) {
      return NextResponse.json(
        { error: 'notes object is required' },
        { status: 400 },
      );
    }

    const saved = await upsertWeeklyGmNotes(
      validated.venue_id,
      validated.week_start,
      notes,
    );

    return NextResponse.json({ notes: saved });
  } catch (err: any) {
    console.error('[share-notes] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
