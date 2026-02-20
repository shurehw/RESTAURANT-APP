/**
 * Operator Intelligence API
 * Owner/director only — NOT visible to managers.
 *
 * GET /api/operator/intelligence?org_id=...
 *   Returns active intelligence items (commitments, patterns, ownership alerts)
 *   Optional: venue_id, type, severity, manager_id, limit
 *
 * GET /api/operator/intelligence?org_id=...&mode=summary
 *   Returns count summary (critical/warning/info)
 *
 * POST /api/operator/intelligence
 *   Acknowledge, resolve, or dismiss an intelligence item
 *   Body: { id, action: 'acknowledge' | 'resolve' | 'dismiss', note? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getActiveIntelligence,
  getIntelligenceSummary,
  acknowledgeIntelligence,
  resolveIntelligence,
  dismissIntelligence,
  type IntelligenceType,
  type IntelligenceSeverity,
} from '@/lib/database/operator-intelligence';

// Role check: only owner/admin in the org
async function checkOperatorAccess(
  request: NextRequest,
  orgId: string,
): Promise<{ authorized: boolean; userId?: string; error?: string }> {
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

  // Check org membership with owner/admin role
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

  return { authorized: true, userId: user.id };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Role gate
    const access = await checkOperatorAccess(request, orgId);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const mode = searchParams.get('mode');

    // Summary mode
    if (mode === 'summary') {
      const venueId = searchParams.get('venue_id') || undefined;
      const summary = await getIntelligenceSummary(orgId, venueId);
      return NextResponse.json({ success: true, summary });
    }

    // Full list mode
    const items = await getActiveIntelligence(orgId, {
      venueId: searchParams.get('venue_id') || undefined,
      type: (searchParams.get('type') as IntelligenceType) || undefined,
      severity: (searchParams.get('severity') as IntelligenceSeverity) || undefined,
      managerId: searchParams.get('manager_id') || undefined,
      limit: parseInt(searchParams.get('limit') || '50', 10),
    });

    return NextResponse.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error: any) {
    console.error('[operator/intelligence] GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action, note, org_id } = body;

    if (!id || !action || !org_id) {
      return NextResponse.json(
        { error: 'id, action, and org_id are required' },
        { status: 400 },
      );
    }

    // Role gate
    const access = await checkOperatorAccess(request, org_id);
    if (!access.authorized) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    let success = false;
    switch (action) {
      case 'acknowledge':
        success = await acknowledgeIntelligence(id, access.userId!);
        break;
      case 'resolve':
        success = await resolveIntelligence(id, access.userId!, note);
        break;
      case 'dismiss':
        success = await dismissIntelligence(id, access.userId!, note);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use acknowledge, resolve, or dismiss.` },
          { status: 400 },
        );
    }

    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('[operator/intelligence] POST error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
