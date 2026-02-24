/**
 * Create Share Token API
 *
 * POST /api/reports/weekly/share
 * Body: { venue_id: string, week_start: string }
 *
 * Creates a token-gated share link for a specific venue+week.
 * Returns the share URL that can be sent to a GM without requiring login.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createShareToken } from '@/lib/database/weekly-share';

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

    const { token, expires_at } = await createShareToken(venue_id, week_start);

    const origin = request.nextUrl.origin;
    const share_url = `${origin}/share/${token}`;

    return NextResponse.json({ token, share_url, expires_at });
  } catch (err: any) {
    console.error('[weekly-share] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
