/**
 * Share Token Data API
 *
 * GET /api/share/[token]
 *
 * Public endpoint — no login required.
 * Validates the share token and returns the full WeeklyAgendaPayload.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/lib/database/weekly-share';
import { buildWeeklyAgenda } from '@/lib/database/weekly-agenda';

export async function GET(
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

    // Compute week end
    const startDate = new Date(validated.week_start + 'T12:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    const payload = await buildWeeklyAgenda(
      validated.venue_id,
      validated.week_start,
      weekEnd,
      validated.organization_id,
      validated.venue_name,
    );

    return NextResponse.json({ payload });
  } catch (err: any) {
    console.error('[share-data] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
