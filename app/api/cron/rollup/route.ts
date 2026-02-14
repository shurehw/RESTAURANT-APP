/**
 * Enforcement Rollup Cron Job
 *
 * POST /api/cron/rollup?date=YYYY-MM-DD
 *   Recomputes portfolio + venue rollups for all orgs.
 *   Runs nightly after TipSee sync completes.
 *   Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { recomputeRollups } from '@/lib/database/portfolio-rollups';

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  // ── 1. Verify Cron Secret ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Determine Date ──
  const dateParam = request.nextUrl.searchParams.get('date');
  let date: string;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    date = dateParam;
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    date = d.toISOString().split('T')[0];
  }

  console.log(`[cron/rollup] Computing rollups for ${date}`);

  // ── 3. Fetch All Active Orgs ──
  const supabase = getServiceClient();
  const { data: orgs, error: orgsError } = await (supabase as any)
    .from('organizations')
    .select('id, name')
    .eq('is_active', true);

  if (orgsError || !orgs || orgs.length === 0) {
    console.error('[cron/rollup] Failed to fetch orgs:', orgsError);
    return NextResponse.json(
      { error: 'No active organizations found' },
      { status: 500 }
    );
  }

  // ── 4. Recompute Each Org ──
  const results = await Promise.allSettled(
    orgs.map(async (org: { id: string; name: string }) => {
      const result = await recomputeRollups(org.id, date);
      console.log(
        `[cron/rollup] ${org.name}: ${result.count} rollups computed${result.error ? ` (error: ${result.error})` : ''}`
      );
      return { org_id: org.id, org_name: org.name, ...result };
    })
  );

  const succeeded = results.filter(
    (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && !r.value.error
  );
  const failed = results.filter(
    (r) => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)
  );

  const totalDuration = Date.now() - t0;
  console.log(
    `[cron/rollup] Done: ${succeeded.length} orgs OK, ${failed.length} failed in ${totalDuration}ms`
  );

  return NextResponse.json({
    success: true,
    date,
    orgs_processed: orgs.length,
    orgs_succeeded: succeeded.length,
    orgs_failed: failed.length,
    duration_ms: totalDuration,
    details: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { error: (r as PromiseRejectedResult).reason?.message }
    ),
  });
}
