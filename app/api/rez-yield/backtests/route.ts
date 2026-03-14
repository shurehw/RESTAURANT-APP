/**
 * Rez Yield Backtests — Read API
 *
 * GET /api/rez-yield/backtests?venue_id=xxx&days=30
 *
 * Returns backtest results for display in the agent dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  let orgId: string | null = null;
  let venueIds: string[] = [];
  try {
    const user = await requireUser();
    const tenant = await getUserOrgAndVenues(user.id);
    orgId = tenant.orgId;
    venueIds = tenant.venueIds || [];
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!venueIds || venueIds.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const searchParams = request.nextUrl.searchParams;
  const venueId = searchParams.get('venue_id');
  const rawDays = Number.parseInt(searchParams.get('days') || '30', 10);
  const days = Number.isFinite(rawDays) && rawDays > 0
    ? Math.min(90, rawDays)
    : 30;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('rez_yield_backtests')
    .select('*')
    .eq('org_id', orgId)
    .gte('business_date', cutoffStr)
    .order('business_date', { ascending: true });

  if (venueId && venueId !== 'all') {
    assertVenueAccess(venueId, venueIds);
    query = query.eq('venue_id', venueId);
  } else {
    query = query.in('venue_id', venueIds);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch recent decisions for the decision log
  let decisionsQuery = (supabase as any)
    .from('rez_yield_decisions')
    .select('id, venue_id, business_date, decision_type, recommendation, confidence, reasoning, payload, created_at')
    .eq('org_id', orgId)
    .gte('business_date', cutoffStr)
    .order('created_at', { ascending: false })
    .limit(100);

  if (venueId && venueId !== 'all') {
    assertVenueAccess(venueId, venueIds);
    decisionsQuery = decisionsQuery.eq('venue_id', venueId);
  } else {
    decisionsQuery = decisionsQuery.in('venue_id', venueIds);
  }

  const { data: decisions, error: decisionsError } = await decisionsQuery;
  if (decisionsError) {
    return NextResponse.json({ error: decisionsError.message }, { status: 500 });
  }

  const backtests = data || [];
  const totalDays = backtests.length;
  const positiveDays = backtests.filter((b: any) => b.revenue_delta > 0).length;
  const totalRevenueDelta = backtests.reduce((s: number, b: any) => s + (Number(b.revenue_delta) || 0), 0);
  const avgRevenueDelta = totalDays > 0 ? totalRevenueDelta / totalDays : 0;
  const totalCoversDelta = backtests.reduce((s: number, b: any) => s + (b.covers_delta || 0), 0);
  const winRate = totalDays > 0 ? Math.round((positiveDays / totalDays) * 100) : 0;

  return NextResponse.json({
    backtests,
    decisions: decisions || [],
    summary: {
      total_days: totalDays,
      positive_days: positiveDays,
      win_rate: winRate,
      total_revenue_delta: Math.round(totalRevenueDelta * 100) / 100,
      avg_revenue_delta: Math.round(avgRevenueDelta * 100) / 100,
      total_covers_delta: totalCoversDelta,
    },
  });
}
