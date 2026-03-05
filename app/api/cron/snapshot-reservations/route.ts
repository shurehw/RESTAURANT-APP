/**
 * Reservation Snapshot Cron
 *
 * GET /api/cron/snapshot-reservations
 *
 * Runs every 6 hours. For each venue with SevenRooms mapping:
 *   1. Fetches confirmed reservations for today through today+7
 *   2. Snapshots confirmed cover counts into reservation_snapshots
 *   3. After 2+ weeks of snapshots, refreshes pacing_baselines
 *
 * These snapshots power the pacing multiplier in forecasts_with_bias,
 * which adjusts the demand forecast based on real-time reservation pace.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import {
  fetchReservationsForVenueDate,
  SEVENROOMS_VENUE_MAP,
} from '@/lib/integrations/sevenrooms';

// Assume service starts at 7 PM local time for hours_to_service calculation
const SERVICE_HOUR = 19;

function verifyCron(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

/** Count confirmed covers from a list of reservations */
function countConfirmed(
  reservations: Array<{ status: string; max_guests: number }>,
): { confirmed: number; pending: number; waitlist: number } {
  let confirmed = 0;
  let pending = 0;
  let waitlist = 0;

  for (const r of reservations) {
    const s = (r.status || '').toUpperCase();
    const covers = r.max_guests || 0;

    if (s === 'WAITLIST') {
      waitlist += covers;
    } else if (['PENDING', 'HELD'].includes(s)) {
      pending += covers;
    } else if (!['CANCEL', 'CANCELED', 'CANCELLED', 'NO_SHOW', 'NO SHOW'].includes(s)) {
      // Everything else (CONFIRMED, ARRIVED, SEATED, COMPLETED, etc.) counts as confirmed
      confirmed += covers;
    }
  }

  return { confirmed, pending, waitlist };
}

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.SEVENROOMS_CLIENT_ID || !process.env.SEVENROOMS_CLIENT_SECRET) {
    return NextResponse.json({ error: 'SevenRooms not configured' }, { status: 500 });
  }

  const startTime = Date.now();
  const supabase = getServiceClient();
  const now = new Date();

  // Snapshot today through 7 days out
  const dates: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().substring(0, 10));
  }

  const venueEntries = Object.entries(SEVENROOMS_VENUE_MAP);
  let snapshotCount = 0;
  let errorCount = 0;

  for (const [opsosVenueId, srVenueId] of venueEntries) {
    for (const date of dates) {
      try {
        const reservations = await fetchReservationsForVenueDate(srVenueId, date);
        const { confirmed, pending, waitlist } = countConfirmed(reservations);

        // Compute hours to service (7 PM on the business date)
        const serviceTime = new Date(`${date}T${String(SERVICE_HOUR).padStart(2, '0')}:00:00`);
        const hoursToService = Math.max(0, (serviceTime.getTime() - now.getTime()) / (1000 * 60 * 60));

        await (supabase as any)
          .from('reservation_snapshots')
          .insert({
            venue_id: opsosVenueId,
            business_date: date,
            confirmed_covers: confirmed,
            pending_covers: pending,
            waitlist_covers: waitlist,
            hours_to_service: Math.round(hoursToService * 10) / 10,
          });

        snapshotCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        console.error(`[snapshot-rez] ${opsosVenueId} ${date}: ${msg}`);
        errorCount++;
      }
    }
  }

  // Refresh baselines if we have enough data (2+ weeks of snapshots)
  let baselinesRefreshed = false;
  try {
    const { count } = await (supabase as any)
      .from('reservation_snapshots')
      .select('*', { count: 'exact', head: true })
      .gte('hours_to_service', 20)
      .lte('hours_to_service', 28);

    if ((count ?? 0) >= 50) {
      await (supabase as any).rpc('refresh_pacing_baselines', { p_lookback_days: 90 });
      baselinesRefreshed = true;
    }
  } catch (err: unknown) {
    console.error('[snapshot-rez] Baseline refresh error:', err instanceof Error ? err.message : err);
  }

  const duration = Date.now() - startTime;
  console.log(`[snapshot-rez] Done: ${snapshotCount} snapshots, ${errorCount} errors, baselines=${baselinesRefreshed}, ${duration}ms`);

  return NextResponse.json({
    snapshots: snapshotCount,
    errors: errorCount,
    baselines_refreshed: baselinesRefreshed,
    duration_ms: duration,
  });
}
