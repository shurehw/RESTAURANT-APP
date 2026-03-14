/**
 * Rez Yield Backtest — Nightly Cron
 *
 * POST /api/cron/rez-yield-backtest?date=YYYY-MM-DD
 *
 * Runs after compute-rez-metrics (needs table_seatings assembled first).
 * For each yield-enabled venue, replays yesterday's reservation book through
 * the engine and records counterfactual outcomes.
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEnabledVenues } from '@/lib/database/rez-yield-config';
import { runBacktest, saveBacktestResult } from '@/lib/database/rez-yield-backtest';

export const maxDuration = 300; // backtests can be slow with many venues

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  return false;
}

function getYesterday(): string {
  // Business date: before 5 AM = previous day
  // Backtest runs after service close, so we want yesterday
  const now = new Date();
  const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pacific.setDate(pacific.getDate() - 1);
  return pacific.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const dateParam = searchParams.get('date');
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : getYesterday();

  // Optional: backtest a single venue
  const venueIdParam = searchParams.get('venue_id');

  // Get yield-enabled venues
  const enabledVenues = await getEnabledVenues();

  const venues = venueIdParam
    ? enabledVenues.filter((v) => v.venue_id === venueIdParam)
    : enabledVenues;

  if (venues.length === 0) {
    return NextResponse.json({
      date,
      message: 'No yield-enabled venues found',
      elapsed_ms: Date.now() - t0,
    });
  }

  const results: Array<{
    venue_id: string;
    status: 'ok' | 'skipped' | 'error';
    revenue_delta?: number;
    covers_delta?: number;
    narrative?: string;
    error?: string;
  }> = [];

  // Process venues in batches of 2 to avoid overwhelming the DB
  const BATCH_SIZE = 2;

  for (let i = 0; i < venues.length; i += BATCH_SIZE) {
    const batch = venues.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (venue) => {
        const result = await runBacktest(venue.org_id, venue.venue_id, date);

        if (!result) {
          return {
            venue_id: venue.venue_id,
            status: 'skipped' as const,
          };
        }

        await saveBacktestResult(result);

        return {
          venue_id: venue.venue_id,
          status: 'ok' as const,
          revenue_delta: result.revenue_delta,
          covers_delta: result.covers_delta,
          narrative: result.narrative,
        };
      }),
    );

    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        results.push({
          venue_id: batch[results.length % batch.length]?.venue_id || 'unknown',
          status: 'error',
          error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        });
      }
    }
  }

  const elapsed = Date.now() - t0;
  const ok = results.filter((r) => r.status === 'ok');
  const skipped = results.filter((r) => r.status === 'skipped');
  const errors = results.filter((r) => r.status === 'error');

  const totalRevenueDelta = ok.reduce((s, r) => s + (r.revenue_delta || 0), 0);
  const totalCoversDelta = ok.reduce((s, r) => s + (r.covers_delta || 0), 0);

  console.log(
    `[rez-backtest] ${date}: ${ok.length} ok, ${skipped.length} skipped, ${errors.length} errors. ` +
    `Revenue delta: $${totalRevenueDelta.toFixed(0)}, covers delta: ${totalCoversDelta}. ${elapsed}ms`,
  );

  return NextResponse.json({
    date,
    elapsed_ms: elapsed,
    summary: {
      total: venues.length,
      ok: ok.length,
      skipped: skipped.length,
      errors: errors.length,
      total_revenue_delta: Math.round(totalRevenueDelta * 100) / 100,
      total_covers_delta: totalCoversDelta,
    },
    details: results,
  });
}
