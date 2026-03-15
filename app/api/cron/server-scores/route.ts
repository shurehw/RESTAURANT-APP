/**
 * Nightly Server Performance Scores Cron
 *
 * Computes rolling 30-day server scores for all active venues,
 * then generates manager actions for at_risk/developing/exceptional servers.
 *
 * Schedule: Run after nightly ETL + attestation signals are in.
 * Recommended: 15:00 UTC (8 AM PT) — 1 hour after nightly report email.
 *
 * GET /api/cron/server-scores?date=YYYY-MM-DD (optional override)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { computeServerScores } from '@/lib/database/server-scores';
import { saveServerScoreActions } from '@/lib/database/server-score-actions';

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

function getYesterday(): string {
  const todayPT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const d = new Date(todayPT + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl?.searchParams;
  const dateParam = searchParams?.get('date');
  const businessDate =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getYesterday();

  console.log(`[server-scores-cron] Starting for ${businessDate}`);

  const supabase = getServiceClient();
  const { data: venues } = await (supabase as any)
    .from('venues')
    .select('id, name')
    .eq('is_active', true);

  if (!venues?.length) {
    return NextResponse.json({
      success: true,
      business_date: businessDate,
      message: 'No active venues',
    });
  }

  const results: Array<{
    venue_id: string;
    venue_name: string;
    servers_scored: number;
    actions_created: number;
    errors: string[];
  }> = [];

  for (const venue of venues) {
    try {
      const scoreResult = await computeServerScores(venue.id, businessDate);

      let actionsCreated = 0;
      if (scoreResult.scored > 0) {
        const actionResult = await saveServerScoreActions(venue.id, businessDate, venue.name);
        actionsCreated = actionResult.actionsCreated;
      }

      results.push({
        venue_id: venue.id,
        venue_name: venue.name,
        servers_scored: scoreResult.scored,
        actions_created: actionsCreated,
        errors: scoreResult.errors,
      });
    } catch (err: any) {
      results.push({
        venue_id: venue.id,
        venue_name: venue.name,
        servers_scored: 0,
        actions_created: 0,
        errors: [err.message],
      });
    }
  }

  const totalScored = results.reduce((s, r) => s + r.servers_scored, 0);
  const totalActions = results.reduce((s, r) => s + r.actions_created, 0);

  console.log(`[server-scores-cron] Done in ${Date.now() - t0}ms: ${totalScored} servers scored, ${totalActions} actions created`);

  return NextResponse.json({
    success: true,
    business_date: businessDate,
    duration_ms: Date.now() - t0,
    total_servers_scored: totalScored,
    total_actions_created: totalActions,
    venues: results,
  });
}
