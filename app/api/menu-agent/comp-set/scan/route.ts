/**
 * Comp Set Scan Endpoint
 *
 * GET /api/menu-agent/comp-set/scan — Scan comp set venues due for refresh
 *
 * Runs AI fuzzy matching on unmatched items and detects price changes.
 * Called by scheduler (twice monthly or per comp_set_scan_frequency_days).
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { scanDueCompSetVenues } from '@/lib/ai/comp-set-researcher';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true;

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
  console.log('[CompSetScan] Started');

  try {
    const url = new URL(request.url);
    const frequencyDays = parseInt(url.searchParams.get('frequency_days') || '14');

    const results = await scanDueCompSetVenues(frequencyDays);

    const successful = results.filter((r) => r.status === 'success').length;
    const totalMatched = results.reduce((sum, r) => sum + r.items_matched, 0);
    const totalPriceChanges = results.reduce(
      (sum, r) => sum + r.price_changes_detected,
      0
    );

    const elapsed = Date.now() - started;
    console.log(
      `[CompSetScan] Complete: ${successful}/${results.length} venues scanned, ${totalMatched} items matched, ${totalPriceChanges} price changes (${elapsed}ms)`
    );

    return NextResponse.json({
      success: true,
      venues_scanned: results.length,
      venues_successful: successful,
      total_items_matched: totalMatched,
      total_price_changes: totalPriceChanges,
      elapsed_ms: elapsed,
      results,
    });
  } catch (err: any) {
    console.error('[CompSetScan] Error:', err);
    return NextResponse.json(
      { error: 'Comp set scan failed', message: err.message },
      { status: 500 }
    );
  }
}
