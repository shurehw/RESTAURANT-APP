/**
 * Menu Agent Dashboard
 *
 * GET /api/menu-agent/dashboard — Aggregated menu health + agent activity
 *
 * Returns everything the UI needs to render the menu agent dashboard:
 * health score, recent runs, pending recommendations, margin bleed,
 * comp set status, and top action items.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getRecentMenuAgentRuns,
  getPendingRecommendations,
  getMenuItemPerformance,
  getMenuMarginHealth,
} from '@/lib/database/menu-agent';
import { getMarginBleedSummary } from '@/lib/database/menu-price-queue';
import { getCompSetVenues, getCompSetPriceMap } from '@/lib/database/comp-set';

export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);
  const venueId = request.nextUrl.searchParams.get('venue_id');
  if (!venueId) {
    return NextResponse.json({ error: 'Missing venue_id' }, { status: 400 });
  }
  assertVenueAccess(venueId, venueIds);

  const [
    recentRuns,
    pendingRecs,
    performance,
    marginHealth,
    marginBleed,
    compVenues,
    compPositions,
  ] = await Promise.all([
    getRecentMenuAgentRuns(venueId, 5),
    getPendingRecommendations(venueId),
    getMenuItemPerformance(venueId),
    getMenuMarginHealth(venueId),
    getMarginBleedSummary(venueId),
    getCompSetVenues(venueId),
    getCompSetPriceMap(venueId),
  ]);

  // Compute summary metrics
  const totalItems = performance.length;
  const criticalBreaches = marginHealth.filter(
    (m: any) => m.margin_status === 'critical'
  ).length;
  const warningBreaches = marginHealth.filter(
    (m: any) => m.margin_status === 'warning'
  ).length;
  const underperformers = performance.filter(
    (p: any) => p.is_underperformer
  ).length;
  const decliningItems = performance.filter(
    (p: any) => p.trend === 'declining'
  ).length;

  // Latest run health score
  const lastRun = recentRuns[0];
  const healthScore = lastRun?.agent_reasoning?.health_score ?? null;

  // Comp set coverage
  const matchedCompItems = compPositions.length;

  return NextResponse.json({
    summary: {
      health_score: healthScore,
      total_menu_items: totalItems,
      critical_margin_breaches: criticalBreaches,
      warning_margin_breaches: warningBreaches,
      underperformers,
      declining_items: decliningItems,
      pending_recommendations: pendingRecs.length,
      margin_bleed_per_week: marginBleed.total_margin_bleed_per_week,
      prices_queued: marginBleed.total_queued,
      next_reprint_date: marginBleed.next_reprint_date,
      comp_set_venues: compVenues.length,
      comp_set_items_matched: matchedCompItems,
    },
    recent_runs: recentRuns,
    pending_recommendations: pendingRecs,
    margin_bleed: marginBleed,
    comp_set_positions: compPositions.slice(0, 10), // top 10 by headroom
  });
}
