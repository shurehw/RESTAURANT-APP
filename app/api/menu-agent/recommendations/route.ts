/**
 * Menu Agent Recommendations
 *
 * GET  /api/menu-agent/recommendations — List recommendations for a venue
 * POST /api/menu-agent/recommendations — Approve/reject a recommendation
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getPendingRecommendations,
  getRecommendationsByRun,
  updateRecommendationStatus,
} from '@/lib/database/menu-agent';

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

  const runId = request.nextUrl.searchParams.get('run_id');
  const status = request.nextUrl.searchParams.get('status');

  let data;
  if (runId) {
    data = await getRecommendationsByRun(runId);
  } else if (status === 'pending') {
    data = await getPendingRecommendations(venueId);
  } else {
    data = await getPendingRecommendations(venueId);
  }

  return NextResponse.json({ recommendations: data });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, action, reason } = body;

  if (!id || !action) {
    return NextResponse.json(
      { error: 'Missing id or action' },
      { status: 400 }
    );
  }

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json(
      { error: 'Action must be approve or reject' },
      { status: 400 }
    );
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  await updateRecommendationStatus(id, status, ctx.authUserId, reason);

  return NextResponse.json({ success: true, status });
}
