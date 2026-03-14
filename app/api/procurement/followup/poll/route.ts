/**
 * PO Follow-up Polling Endpoint
 *
 * GET /api/procurement/followup/poll — Called every 30 minutes
 *
 * Processes pending follow-up actions for all POs:
 *   T-48h → confirmation request to vendor
 *   T-24h → escalation if no confirmation
 *   T-4h  → at-risk alert
 *   T+4h  → missed delivery, scorecard hit
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { executePendingFollowups } from '@/lib/database/po-followup';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true;

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await executePendingFollowups();

    const summary = {
      total_processed: results.length,
      executed: results.filter((r) => !r.skipped_reason).length,
      skipped: results.filter((r) => !!r.skipped_reason).length,
      by_type: {} as Record<string, number>,
    };

    for (const r of results) {
      summary.by_type[r.followup_type] = (summary.by_type[r.followup_type] || 0) + 1;
    }

    console.log('[procurement-followup-poll]', JSON.stringify(summary));

    return NextResponse.json({
      success: true,
      ...summary,
      results,
    });
  } catch (error: any) {
    console.error('[procurement-followup-poll] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Followup poll failed' },
      { status: 500 }
    );
  }
}
