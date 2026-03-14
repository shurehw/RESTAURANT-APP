/**
 * Realtime Adjustments API — Manager Approval Workflow
 *
 * GET  /api/labor/adjustments?venue_id=...&business_date=... — List pending adjustments
 * PATCH /api/labor/adjustments — Approve or reject an adjustment
 *
 * Auth: resolveContext() — requires authenticated user
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getPendingAdjustments,
  getAdjustmentById,
  executeAdjustment,
  rejectAdjustment,
} from '@/lib/database/shift-monitoring';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    const businessDate = request.nextUrl.searchParams.get('business_date');

    if (!venueId || !businessDate) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 }
      );
    }
    assertVenueAccess(venueId, venueIds);

    const adjustments = await getPendingAdjustments(venueId, businessDate);

    return NextResponse.json({
      success: true,
      adjustments,
      count: adjustments.length,
    });
  });
}

export async function PATCH(request: NextRequest) {
  return guard(async () => {
    const ctx = await resolveContext();
    if (!ctx?.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);

    let body: { id: string; action: 'approve' | 'reject'; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.id || !body.action) {
      return NextResponse.json(
        { error: 'id and action (approve|reject) are required' },
        { status: 400 }
      );
    }

    if (body.action !== 'approve' && body.action !== 'reject') {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      );
    }

    const userId = ctx.authUserId;
    const adjustment = await getAdjustmentById(body.id);
    if (!adjustment) {
      return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 });
    }
    assertVenueAccess(adjustment.venue_id, venueIds);

    if (body.action === 'approve') {
      const ok = await executeAdjustment(body.id, adjustment.venue_id, userId);
      if (!ok) {
        return NextResponse.json(
          { error: 'Failed to approve adjustment (may already be processed)' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true, status: 'approved' });
    }

    // Reject
    const ok = await rejectAdjustment(body.id, adjustment.venue_id, body.reason || 'Manager rejected', userId);
    if (!ok) {
      return NextResponse.json(
        { error: 'Failed to reject adjustment (may already be processed)' },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, status: 'rejected' });
  });
}
