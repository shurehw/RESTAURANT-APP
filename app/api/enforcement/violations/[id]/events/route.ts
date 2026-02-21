/**
 * Violation Events API — Append-Only Timeline
 *
 * GET /api/enforcement/violations/:id/events
 *
 * Returns the complete event history for a violation.
 * Auth: session-based, validates org membership.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { profile } = await requireUser();
    const { id: violationId } = await params;

    const supabase = getServiceClient() as any;

    // Verify violation belongs to caller's org
    const { data: violation } = await supabase
      .from('control_plane_violations')
      .select('id, org_id')
      .eq('id', violationId)
      .single();

    if (!violation) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    if (violation.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Fetch all events for this violation
    const { data: events, error } = await supabase
      .from('violation_events')
      .select('id, event_type, from_status, to_status, actor_id, occurred_at, metadata')
      .eq('violation_id', violationId)
      .order('occurred_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      violation_id: violationId,
      count: events?.length || 0,
      events: events || [],
    });
  } catch (error: any) {
    console.error('[violation/events] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 },
    );
  }
}
