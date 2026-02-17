/**
 * Check Drill-Down API
 *
 * GET /api/sales/checks?venue_id=xxx&date=YYYY-MM-DD  — list all checks
 * GET /api/sales/checks?check_id=xxx                   — single check detail
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';
import {
  fetchChecksForDate,
  fetchCheckDetail,
  getPosTypeForLocations,
} from '@/lib/database/tipsee';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  const userId = user?.id || cookieStore.get('user_id')?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checkId = request.nextUrl.searchParams.get('check_id');
  const venueId = request.nextUrl.searchParams.get('venue_id');
  const date = request.nextUrl.searchParams.get('date');

  // Single check detail
  if (checkId) {
    try {
      const detail = await fetchCheckDetail(checkId);
      if (!detail) {
        return NextResponse.json({ error: 'Check not found' }, { status: 404 });
      }
      return NextResponse.json(detail);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch check detail';
      console.error('Check detail API error:', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Check list for venue + date
  if (!venueId || !date) {
    return NextResponse.json(
      { error: 'venue_id and date are required (or provide check_id)' },
      { status: 400 }
    );
  }

  try {
    const locationUuids = await getTipseeMappingForVenue(venueId);
    if (locationUuids.length === 0) {
      return NextResponse.json(
        { error: 'No TipSee mapping for this venue' },
        { status: 404 }
      );
    }

    const posType = await getPosTypeForLocations(locationUuids);
    if (posType === 'simphony') {
      return NextResponse.json({
        checks: [],
        pos_type: 'simphony',
        count: 0,
        total: 0,
        message: 'Individual check data is not available for Simphony POS venues',
      });
    }

    const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const limit = rawLimit === 0 ? 0 : Math.min(rawLimit, 200); // 0 = fetch all
    const offset = limit === 0 ? 0 : parseInt(request.nextUrl.searchParams.get('offset') || '0', 10);

    const { checks, total } = await fetchChecksForDate(locationUuids, date, limit, offset);
    return NextResponse.json({
      checks,
      pos_type: 'upserve',
      count: checks.length,
      total,
      limit,
      offset,
      has_more: offset + checks.length < total,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch checks';
    console.error('Checks list API error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
