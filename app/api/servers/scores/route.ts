/**
 * GET /api/servers/scores — Get server performance scores
 * POST /api/servers/scores — Compute/refresh scores for a venue
 *
 * GET params: venue_id, server_name (optional), days (optional, for history)
 * POST body: { venue_id, business_date, window_days? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import {
  computeServerScores,
  getLatestServerScores,
  getServerScoreHistory,
} from '@/lib/database/server-scores';

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');
    const serverName = searchParams.get('server_name');
    const days = parseInt(searchParams.get('days') || '0');

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }

    // If server_name provided, return history for that server
    if (serverName) {
      const history = await getServerScoreHistory(venueId, serverName, days || 90);
      return NextResponse.json({ success: true, data: history });
    }

    // Otherwise return latest scores for all servers
    const scores = await getLatestServerScores(venueId);
    return NextResponse.json({ success: true, data: scores });
  } catch (error: any) {
    console.error('Server scores GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth: CRON_SECRET or authenticated user
    const authHeader = request.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      const ctx = await resolveContext();
      if (!ctx?.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { venue_id, business_date, window_days = 30 } = body;

    if (!venue_id || !business_date) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 }
      );
    }

    const result = await computeServerScores(venue_id, business_date, window_days);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Server scores POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
