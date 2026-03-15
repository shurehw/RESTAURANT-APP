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
  fetchSimphonyChecksForDate,
  fetchCheckDetail,
  getPosTypeForLocations,
} from '@/lib/database/tipsee';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toSafeInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
    const mappedLocationUuids = await getTipseeMappingForVenue(venueId);
    const locationUuids = [...new Set(
      mappedLocationUuids
        .map((value) => value?.trim())
        .filter((value): value is string => !!value && UUID_REGEX.test(value)),
    )];

    if (locationUuids.length === 0) {
      return NextResponse.json(
        { error: 'No valid TipSee mapping for this venue' },
        { status: 404 }
      );
    }

    const rawLimit = toSafeInt(request.nextUrl.searchParams.get('limit'), 50);
    const limit = rawLimit === 0 ? 0 : Math.max(1, Math.min(rawLimit, 200)); // 0 = fetch all
    const rawOffset = toSafeInt(request.nextUrl.searchParams.get('offset'), 0);
    const offset = limit === 0 ? 0 : Math.max(0, rawOffset);

    const posType = await getPosTypeForLocations(locationUuids);
    const fetcher = posType === 'simphony'
      ? fetchSimphonyChecksForDate
      : fetchChecksForDate;

    const { checks, total } = await fetcher(locationUuids, date, limit, offset);
    return NextResponse.json({
      checks,
      pos_type: posType,
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
