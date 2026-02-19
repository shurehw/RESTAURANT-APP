/**
 * Demand Distribution Curves Refresh — Cron Endpoint
 *
 * Recomputes 30-minute demand curves from TipSee check-level data.
 * Run weekly (e.g., Sunday 6am) after nightly sync completes.
 *
 * Protected by CRON_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { computeAllVenueCurves } from '@/lib/etl/demand-curves';

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  // Verify Cron Secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional lookback override via query param
  const searchParams = request.nextUrl?.searchParams;
  const lookbackParam = searchParams?.get('lookback');
  const lookbackDays = lookbackParam ? parseInt(lookbackParam) : 90;

  console.log(`[refresh-curves] Starting curve computation (lookback=${lookbackDays}d)`);

  try {
    const results = await computeAllVenueCurves(lookbackDays);

    const succeeded = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);

    console.log(`[refresh-curves] Done in ${Date.now() - t0}ms: ${succeeded.length} venues ok, ${failed.length} failed`);

    return NextResponse.json({
      status: 'ok',
      duration_ms: Date.now() - t0,
      lookback_days: lookbackDays,
      venues_processed: results.length,
      venues_succeeded: succeeded.length,
      venues_failed: failed.length,
      results,
    });
  } catch (err: any) {
    console.error('[refresh-curves] Fatal error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error', duration_ms: Date.now() - t0 },
      { status: 500 }
    );
  }
}
