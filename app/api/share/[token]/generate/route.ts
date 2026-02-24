/**
 * Share Token Generate Narrative API
 *
 * POST /api/share/[token]/generate
 *
 * Public endpoint — no login required.
 * Builds fresh payload (including just-saved GM notes) and generates
 * AI executive narrative for the venue+week.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateShareToken } from '@/lib/database/weekly-share';
import { buildWeeklyAgenda } from '@/lib/database/weekly-agenda';
import { generateWeeklyNarrative } from '@/lib/ai/weekly-narrator';

export async function POST(
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

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'AI not configured' },
        { status: 503 },
      );
    }

    // Compute week end
    const startDate = new Date(validated.week_start + 'T12:00:00Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = endDate.toISOString().split('T')[0];

    // Build fresh payload (picks up just-saved GM notes)
    const payload = await buildWeeklyAgenda(
      validated.venue_id,
      validated.week_start,
      weekEnd,
      validated.organization_id,
      validated.venue_name,
    );

    const narrative = await generateWeeklyNarrative(payload);

    return NextResponse.json({
      narrative,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[share-generate] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
