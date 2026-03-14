/**
 * Cross-Venue Bundle API
 *
 * GET  /api/procurement/bundle — List bundling opportunities
 * POST /api/procurement/bundle — Execute a bundle
 *
 * Auth: resolveContext() (user session, manager+ role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import {
  detectBundlingOpportunities,
  executeBundle,
} from '@/lib/ai/procurement-bundler';

/**
 * GET — Detect and list bundling opportunities for the org.
 */
export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const windowHours = parseInt(
      request.nextUrl.searchParams.get('window_hours') || '24'
    );

    const opportunities = await detectBundlingOpportunities(ctx.orgId, windowHours);

    return NextResponse.json({
      success: true,
      opportunities_found: opportunities.length,
      total_potential_savings: opportunities.reduce((sum, o) => sum + o.estimated_savings, 0),
      opportunities,
    });
  } catch (error: any) {
    console.error('[procurement-bundle] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect bundling opportunities' },
      { status: 500 }
    );
  }
}

/**
 * POST — Execute a bundle (approve and consolidate POs).
 * Body: { vendor_id: string, venue_ids: string[] }
 */
export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx?.authUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { vendor_id, venue_ids } = body;

    if (!vendor_id || !venue_ids?.length) {
      return NextResponse.json(
        { error: 'vendor_id and venue_ids are required' },
        { status: 400 }
      );
    }

    // Re-detect the specific opportunity to get current data
    const opportunities = await detectBundlingOpportunities(ctx.orgId, 48);
    const opportunity = opportunities.find(
      (o) =>
        o.vendor_id === vendor_id &&
        venue_ids.every((v: string) => o.venue_ids.includes(v))
    );

    if (!opportunity) {
      return NextResponse.json(
        { error: 'Bundle opportunity no longer available — POs may have changed' },
        { status: 404 }
      );
    }

    const result = await executeBundle(ctx.orgId, opportunity, ctx.authUserId);

    return NextResponse.json({
      success: true,
      bundle_id: result.bundle_id,
      po_ids: result.po_ids,
      total_savings: result.total_savings,
    });
  } catch (error: any) {
    console.error('[procurement-bundle] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute bundle' },
      { status: 500 }
    );
  }
}
