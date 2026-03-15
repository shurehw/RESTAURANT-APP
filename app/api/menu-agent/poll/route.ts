/**
 * Menu Agent Polling Endpoint
 *
 * GET /api/menu-agent/poll — Called by external scheduler (daily at 6 AM)
 *
 * For each venue with menu agent enabled:
 * 1. Analyze menu performance (margins, velocity, cannibalization, comp set)
 * 2. Generate recommendations (price changes, removals, substitutions)
 * 3. Auto-execute within policy (MP/digital items within band)
 * 4. Queue price changes for reprint windows (printed items)
 * 5. Record full agent run with reasoning
 *
 * Auth: CRON_SECRET bearer token (matches procurement agent poll pattern)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runMenuAgent } from '@/lib/ai/menu-agent';
import { getMenuAgentEnabledVenues } from '@/lib/database/menu-agent';
import { expireStaleQueueEntries } from '@/lib/database/menu-price-queue';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get('secret') === CRON_SECRET;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  console.log('[MenuAgent] Poll started');

  try {
    // Get all venues with menu agent enabled (not in advise-only mode)
    const venues = await getMenuAgentEnabledVenues();

    if (venues.length === 0) {
      console.log('[MenuAgent] No enabled venues found');
      return NextResponse.json({
        success: true,
        venues_processed: 0,
        message: 'No venues with menu agent enabled',
      });
    }

    console.log(`[MenuAgent] Processing ${venues.length} venues`);

    // Expire stale queue entries (>90 days old)
    const expired = await expireStaleQueueEntries(90);
    if (expired > 0) {
      console.log(`[MenuAgent] Expired ${expired} stale price queue entries`);
    }

    // Process each venue
    const results = await Promise.allSettled(
      venues.map(async (venue) => {
        try {
          const result = await runMenuAgent(
            venue.venue_id,
            venue.org_id,
            'cron'
          );
          return {
            venue_id: venue.venue_id,
            venue_name: venue.venue_name,
            success: true,
            recommendations: result.recommendations_created,
            auto_executed: result.auto_executed,
            pending_approval: result.pending_approval,
            prices_queued: result.prices_queued,
            health_score: result.analysis.overall_health_score,
            signals: result.analysis.signals_detected,
          };
        } catch (err: any) {
          console.error(
            `[MenuAgent] Error processing ${venue.venue_name}:`,
            err.message
          );
          return {
            venue_id: venue.venue_id,
            venue_name: venue.venue_name,
            success: false,
            error: err.message,
          };
        }
      })
    );

    const venueResults = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { success: false, error: 'Promise rejected' }
    );

    const successful = venueResults.filter((r: any) => r.success).length;
    const totalRecs = venueResults.reduce(
      (sum: number, r: any) => sum + (r.recommendations || 0),
      0
    );
    const totalAutoExec = venueResults.reduce(
      (sum: number, r: any) => sum + (r.auto_executed || 0),
      0
    );

    const elapsed = Date.now() - started;
    console.log(
      `[MenuAgent] Poll complete: ${successful}/${venues.length} venues, ${totalRecs} recommendations, ${totalAutoExec} auto-executed (${elapsed}ms)`
    );

    return NextResponse.json({
      success: true,
      venues_processed: venues.length,
      venues_successful: successful,
      total_recommendations: totalRecs,
      total_auto_executed: totalAutoExec,
      stale_entries_expired: expired,
      elapsed_ms: elapsed,
      venues: venueResults,
    });
  } catch (err: any) {
    console.error('[MenuAgent] Poll error:', err);
    return NextResponse.json(
      { error: 'Menu agent poll failed', message: err.message },
      { status: 500 }
    );
  }
}
