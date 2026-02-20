/**
 * Signal Analytics API — OPERATOR ONLY
 *
 * Contains ownership scores, avoidance rates, manager comparisons.
 * Gated to owner/admin roles via organization_users.
 *
 * GET /api/attestation/signals/analytics?mode=...&org_id=...
 *
 * Modes:
 *   profile    — Manager signal profile (aggregated)
 *     ?mode=profile&org_id=...&manager_id=...&days=90&venue_id=...
 *
 *   timeline   — Day-by-day signal breakdown for a manager
 *     ?mode=timeline&org_id=...&manager_id=...&days=30&venue_id=...
 *
 *   feed       — Filterable signal feed with manager info
 *     ?mode=feed&org_id=...&venue_id=...&manager_id=...&signal_type=...&days=30&limit=100
 *
 *   compare    — Compare managers across a venue
 *     ?mode=compare&org_id=...&venue_id=...&days=90
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getManagerSignalProfile,
  getManagerSignalTimeline,
  getSignalFeed,
  getManagerComparison,
} from '@/lib/database/signal-analytics';

// Role check: only owner/admin in the org
async function checkOperatorAccess(
  request: NextRequest,
  orgId: string,
): Promise<{ authorized: boolean; error?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { authorized: false, error: 'Missing authorization' };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Not authenticated' };
  }

  const { getServiceClient } = await import('@/lib/supabase/service');
  const service = getServiceClient();

  const { data: orgUser } = await (service as any)
    .from('organization_users')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (!orgUser || !['owner', 'admin'].includes(orgUser.role)) {
    return { authorized: false, error: 'Insufficient permissions — owner or admin required' };
  }

  return { authorized: true };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Role gate — owner/admin only
    const access = await checkOperatorAccess(request, orgId);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const mode = searchParams.get('mode') || 'feed';
    const managerId = searchParams.get('manager_id');
    const venueId = searchParams.get('venue_id');
    const days = parseInt(searchParams.get('days') || '30', 10);

    switch (mode) {
      case 'profile': {
        if (!managerId) {
          return NextResponse.json({ error: 'manager_id is required for profile mode' }, { status: 400 });
        }
        const profile = await getManagerSignalProfile(managerId, {
          days,
          venueId: venueId || undefined,
        });
        if (!profile) {
          return NextResponse.json({ error: 'No signals found for this manager' }, { status: 404 });
        }
        return NextResponse.json({ success: true, profile });
      }

      case 'timeline': {
        if (!managerId) {
          return NextResponse.json({ error: 'manager_id is required for timeline mode' }, { status: 400 });
        }
        const timeline = await getManagerSignalTimeline(managerId, {
          days,
          venueId: venueId || undefined,
        });
        return NextResponse.json({ success: true, timeline });
      }

      case 'feed': {
        const signalType = searchParams.get('signal_type') || undefined;
        const entityName = searchParams.get('entity_name') || undefined;
        const limit = parseInt(searchParams.get('limit') || '100', 10);

        const signals = await getSignalFeed({
          venueId: venueId || undefined,
          managerId: managerId || undefined,
          signalType,
          entityName,
          days,
          limit,
        });

        return NextResponse.json({
          success: true,
          count: signals.length,
          signals,
        });
      }

      case 'compare': {
        if (!venueId) {
          return NextResponse.json({ error: 'venue_id is required for compare mode' }, { status: 400 });
        }
        const comparison = await getManagerComparison(venueId, { days });
        return NextResponse.json({
          success: true,
          managers: comparison,
        });
      }

      default:
        return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[signals/analytics] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 },
    );
  }
}
