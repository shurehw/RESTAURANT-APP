/**
 * Reservation Sync Cron
 *
 * POST /api/cron/sync-reservations?date=YYYY-MM-DD (optional)
 *
 * Syncs reservations from SevenRooms into the native reservations table.
 * Runs every 5 minutes during service hours via QStash.
 * Syncs today + tomorrow for pre-service planning.
 *
 * Auth: CRON_SECRET bearer token
 * Pattern: app/api/cron/optimize-pacing/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { syncReservationsFromSR, type SyncResult } from '@/lib/etl/reservation-sync';

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get('date');
  const venueParam = searchParams.get('venue_id');

  // Default: sync today + tomorrow
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dates = dateParam ? [dateParam] : [today, tomorrow];

  const supabase = getServiceClient();

  // Get all venues with SR connected
  const { data: srSettings } = await (supabase as any)
    .from('sevenrooms_venue_settings')
    .select('venue_id, org_id, sr_venue_id')
    .eq('is_connected', true)
    .not('sr_venue_id', 'is', null);

  if (!srSettings || srSettings.length === 0) {
    return NextResponse.json({
      message: 'No SR-connected venues found',
      duration_ms: Date.now() - t0,
    });
  }

  // Optionally filter to a specific venue
  const venues = venueParam
    ? srSettings.filter((v: any) => v.venue_id === venueParam)
    : srSettings;

  const results: SyncResult[] = [];

  // Process each venue × date
  for (const venue of venues) {
    for (const date of dates) {
      try {
        const result = await syncReservationsFromSR(venue.venue_id, venue.org_id, date);
        results.push(result);
      } catch (err: any) {
        results.push({
          venueId: venue.venue_id,
          date,
          synced: 0,
          errors: [err.message || 'Sync failed'],
          duration_ms: 0,
        });
      }
    }
  }

  const totalSynced = results.reduce((s, r) => s + r.synced, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  return NextResponse.json({
    dates,
    venues_processed: venues.length,
    total_synced: totalSynced,
    total_errors: totalErrors,
    results,
    duration_ms: Date.now() - t0,
  });
}
