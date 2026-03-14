/**
 * Procurement Agent Dashboard API
 *
 * GET /api/procurement/agent/dashboard
 *
 * Returns agent activity summary: runs, POs generated, savings,
 * followups, pending actions. Powers the "agent is working" visibility.
 *
 * Auth: resolveContext() (user session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getAgentDashboard } from '@/lib/database/procurement-agent-dashboard';

export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);
    const venueId = request.nextUrl.searchParams.get('venue_id') || undefined;
    if (venueId) assertVenueAccess(venueId, venueIds);
    const dashboard = await getAgentDashboard(ctx.orgId, venueId);

    return NextResponse.json({
      success: true,
      ...dashboard,
    });
  } catch (error: any) {
    console.error('[procurement-dashboard] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}
