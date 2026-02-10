/**
 * TipSee Sync Cron Job
 *
 * Syncs TipSee data to Supabase nightly for fast report loading.
 * Runs daily at 3am via Vercel Cron.
 *
 * Protected by CRON_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { fetchNightlyReport } from '@/lib/database/tipsee';

interface VenueMapping {
  id: string;
  name: string;
  tipsee_location_uuid: string;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  // ── 1. Verify Cron Secret ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('[sync-tipsee] Unauthorized: Invalid or missing CRON_SECRET');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // ── 2. Determine Sync Date & Venue Filter ──
  // Allow manual date override via query param for backfilling
  // Allow venue filter via query param for parallel processing
  // Default: yesterday (reports are available next day), all venues
  const searchParams = request.nextUrl?.searchParams;
  const dateParam = searchParams?.get('date');
  const venueParam = searchParams?.get('venue'); // e.g., "nice-guy" or venue UUID

  let businessDate: string;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    businessDate = dateParam;
    console.log(`[sync-tipsee] Manual sync requested for ${businessDate}`);
  } else {
    const syncDate = new Date();
    syncDate.setDate(syncDate.getDate() - 1);
    businessDate = syncDate.toISOString().split('T')[0];
    console.log(`[sync-tipsee] Starting automatic sync for ${businessDate}`);
  }

  if (venueParam) {
    console.log(`[sync-tipsee] Venue filter: ${venueParam}`);
  }

  // ── 3. Create Sync Log Entry ──
  const supabase = getServiceClient();
  const { data: syncLog, error: syncLogError } = await (supabase as any)
    .from('tipsee_sync_log')
    .insert({
      sync_date: businessDate,
      status: 'running',
      triggered_by: 'cron',
      cron_job_id: request.headers.get('x-vercel-cron-id') || null,
    })
    .select('id')
    .single();

  if (syncLogError || !syncLog) {
    console.error('[sync-tipsee] Failed to create sync log:', syncLogError);
    return NextResponse.json(
      { error: 'Failed to create sync log' },
      { status: 500 }
    );
  }

  const syncLogId = syncLog.id;
  let venuesSynced = 0;
  let venuesFailed = 0;

  try {
    // ── 4. Fetch Active Venue Mappings ──
    const { data: mappings, error: mappingsError } = await (supabase as any)
      .from('venue_tipsee_mapping')
      .select(`
        venue_id,
        tipsee_location_uuid,
        venues (
          id,
          name
        )
      `)
      .eq('is_active', true);

    if (mappingsError) {
      throw new Error(`Failed to fetch venue mappings: ${mappingsError.message}`);
    }

    if (!mappings || mappings.length === 0) {
      console.log('[sync-tipsee] No active venue mappings found');
      await updateSyncLog(syncLogId, 'completed', 0, 0, Date.now() - t0);
      return NextResponse.json({
        success: true,
        message: 'No venues to sync',
        venuesSynced: 0,
        venuesFailed: 0,
      });
    }

    let venues: VenueMapping[] = mappings
      .filter((m: any) => m.venues && m.tipsee_location_uuid)
      .map((m: any) => ({
        id: m.venue_id,
        name: m.venues.name,
        tipsee_location_uuid: m.tipsee_location_uuid,
      }));

    // Apply venue filter if specified
    if (venueParam) {
      venues = venues.filter((v: VenueMapping) => {
        const slug = v.name.toLowerCase().replace(/\s+/g, '-');
        return (
          v.tipsee_location_uuid === venueParam ||
          v.id === venueParam ||
          slug === venueParam ||
          v.name.toLowerCase().includes(venueParam.toLowerCase())
        );
      });

      if (venues.length === 0) {
        console.warn(`[sync-tipsee] No venues matched filter: ${venueParam}`);
        await updateSyncLog(syncLogId, 'completed', 0, 0, Date.now() - t0);
        return NextResponse.json({
          success: true,
          message: `No venues matched filter: ${venueParam}`,
          venuesSynced: 0,
          venuesFailed: 0,
        });
      }

      console.log(`[sync-tipsee] Filtered to ${venues.length} venue(s): ${venues.map((v: VenueMapping) => v.name).join(', ')}`);
    } else {
      console.log(`[sync-tipsee] Found ${venues.length} venues to sync`);
    }

    // ── 5. Sync Each Venue (Sequential to avoid overloading TipSee) ──
    for (const venue of venues) {
      try {
        const venueT0 = Date.now();
        console.log(`[sync-tipsee] Syncing ${venue.name} (${venue.tipsee_location_uuid.substring(0, 8)}...)`);

        // Fetch from TipSee
        const report = await fetchNightlyReport(businessDate, venue.tipsee_location_uuid);
        const queryDuration = Date.now() - venueT0;

        // Upsert to cache
        const { error: upsertError } = await (supabase as any)
          .from('tipsee_nightly_cache')
          .upsert({
            venue_id: venue.id,
            business_date: businessDate,
            location_uuid: venue.tipsee_location_uuid,
            location_name: venue.name,
            report_data: report,
            synced_at: new Date().toISOString(),
            query_duration_ms: queryDuration,
          }, {
            onConflict: 'venue_id,business_date',
          });

        if (upsertError) {
          console.error(`[sync-tipsee] Failed to cache ${venue.name}:`, upsertError);
          venuesFailed++;
        } else {
          console.log(`[sync-tipsee] ✓ ${venue.name} synced in ${queryDuration}ms`);
          venuesSynced++;
        }
      } catch (error: any) {
        console.error(`[sync-tipsee] Error syncing ${venue.name}:`, error);
        venuesFailed++;
      }
    }

    // ── 6. Update Sync Log ──
    const totalDuration = Date.now() - t0;
    await updateSyncLog(syncLogId, 'completed', venuesSynced, venuesFailed, totalDuration);

    console.log(`[sync-tipsee] Completed: ${venuesSynced} synced, ${venuesFailed} failed in ${totalDuration}ms`);

    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      syncDate: businessDate,
      venuesSynced,
      venuesFailed,
      totalDurationMs: totalDuration,
    });
  } catch (error: any) {
    console.error('[sync-tipsee] Fatal error:', error);
    await updateSyncLog(syncLogId, 'failed', venuesSynced, venuesFailed, Date.now() - t0, error.message);

    return NextResponse.json(
      {
        error: 'Sync failed',
        message: error.message,
        venuesSynced,
        venuesFailed,
      },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

async function updateSyncLog(
  syncLogId: string,
  status: 'completed' | 'failed',
  venuesSynced: number,
  venuesFailed: number,
  totalDurationMs: number,
  errorMessage?: string
): Promise<void> {
  const supabase = getServiceClient();
  await (supabase as any)
    .from('tipsee_sync_log')
    .update({
      status,
      venues_synced: venuesSynced,
      venues_failed: venuesFailed,
      total_duration_ms: totalDurationMs,
      completed_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq('id', syncLogId);
}
