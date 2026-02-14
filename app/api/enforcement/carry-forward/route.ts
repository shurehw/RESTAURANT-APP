/**
 * Carry-Forward Cron Endpoint
 *
 * GET /api/enforcement/carry-forward
 *
 * Called by an external scheduler (QStash, cron-job.org, etc.)
 * Recommended schedule: every 30 minutes
 *
 * Scans all active manager_actions and feedback_objects for overdue items
 * and auto-escalates them based on priority/age rules.
 *
 * Auth: x-cron-secret header (matches ETL/poll pattern)
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCarryForward } from '@/lib/enforcement/carry-forward';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Auth check
  const secret =
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const result = await runCarryForward();

    return NextResponse.json({
      success: true,
      duration_ms: Date.now() - start,
      ...result,
    });
  } catch (err: any) {
    console.error('[CarryForward Cron] Fatal error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Internal error',
        duration_ms: Date.now() - start,
      },
      { status: 500 }
    );
  }
}
