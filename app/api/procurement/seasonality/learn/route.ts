/**
 * Seasonality Learning — Weekly Cron
 *
 * POST /api/procurement/seasonality/learn
 *
 * Recomputes item seasonality profiles from historical consumption data.
 * Run weekly (Sunday night) to keep demand multipliers current.
 *
 * Auth: CRON_SECRET bearer token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { learnSeasonality } from '@/lib/ai/procurement-seasonality';

export const maxDuration = 300; // seasonality analysis can be slow with many items

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  return false;
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgId = request.nextUrl.searchParams.get('org_id');
    const venueId = request.nextUrl.searchParams.get('venue_id') || undefined;

    // If no org_id, run for all orgs with procurement agent enabled
    let orgIds: string[] = [];

    if (orgId) {
      orgIds = [orgId];
    } else {
      const supabase = getServiceClient();
      const { data: settings } = await (supabase as any)
        .from('procurement_settings')
        .select('org_id')
        .eq('agent_enabled', true);

      orgIds = (settings || []).map((s: any) => s.org_id);
    }

    if (orgIds.length === 0) {
      return NextResponse.json({
        message: 'No orgs with procurement agent enabled',
        elapsed_ms: Date.now() - t0,
      });
    }

    const allResults = [];

    for (const oid of orgIds) {
      const results = await learnSeasonality(oid, venueId);
      allResults.push({ org_id: oid, venues: results });
    }

    const totalProfiles = allResults.reduce(
      (s, r) => s + r.venues.reduce((vs: number, v: any) => vs + v.profiles_written, 0),
      0
    );
    const totalItems = allResults.reduce(
      (s, r) => s + r.venues.reduce((vs: number, v: any) => vs + v.items_analyzed, 0),
      0
    );

    const elapsed = Date.now() - t0;

    console.log(
      `[seasonality-learn] ${orgIds.length} orgs, ${totalItems} items analyzed, ${totalProfiles} profiles written. ${elapsed}ms`
    );

    return NextResponse.json({
      success: true,
      elapsed_ms: elapsed,
      orgs_processed: orgIds.length,
      total_items_analyzed: totalItems,
      total_profiles_written: totalProfiles,
      details: allResults,
    });
  } catch (error: any) {
    console.error('[seasonality-learn] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to learn seasonality' },
      { status: 500 }
    );
  }
}
