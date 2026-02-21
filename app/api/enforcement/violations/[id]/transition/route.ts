/**
 * Violation State Transition API
 *
 * POST /api/enforcement/violations/:id/transition
 * Body: {
 *   action: "acknowledge" | "submit_action" | "verify" | "resolve" | "waive",
 *   action_summary?: string,      // required for submit_action
 *   resolution_note?: string,     // optional for resolve
 *   waiver_reason?: string,       // required for waive
 * }
 *
 * Auth: session-based via requireUser()
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/require-user';
import { getServiceClient } from '@/lib/supabase/service';
import {
  acknowledgeViolation,
  submitAction,
  verifyViolation,
  resolveViolation,
  waiveViolation,
} from '@/lib/enforcement/state-machine';

type TransitionAction = 'acknowledge' | 'submit_action' | 'verify' | 'resolve' | 'waive';

const VALID_ACTIONS: TransitionAction[] = [
  'acknowledge', 'submit_action', 'verify', 'resolve', 'waive',
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, profile } = await requireUser();
    const { id: violationId } = await params;

    const body = await request.json();
    const action = body.action as TransitionAction;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // Use service client for state transitions (bypasses RLS for the update)
    const supabase = getServiceClient() as any;

    // Verify the violation belongs to the caller's org
    const { data: violation } = await supabase
      .from('control_plane_violations')
      .select('id, org_id, status')
      .eq('id', violationId)
      .single();

    if (!violation) {
      return NextResponse.json({ error: 'Violation not found' }, { status: 404 });
    }

    if (violation.org_id !== profile.org_id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    let result;

    switch (action) {
      case 'acknowledge':
        result = await acknowledgeViolation(supabase, violationId, user.id);
        break;

      case 'submit_action':
        if (!body.action_summary) {
          return NextResponse.json(
            { error: 'action_summary is required for submit_action' },
            { status: 400 },
          );
        }
        result = await submitAction(supabase, violationId, user.id, body.action_summary);
        break;

      case 'verify':
        result = await verifyViolation(supabase, violationId, user.id);
        break;

      case 'resolve':
        result = await resolveViolation(supabase, violationId, user.id, body.resolution_note);
        break;

      case 'waive':
        if (!body.waiver_reason) {
          return NextResponse.json(
            { error: 'waiver_reason is required for waive' },
            { status: 400 },
          );
        }
        result = await waiveViolation(
          supabase, violationId, user.id, body.waiver_reason, profile.org_id,
        );
        break;
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, from_status: result.from_status, to_status: result.to_status },
        { status: 409 },
      );
    }

    return NextResponse.json({
      success: true,
      violation_id: result.violation_id,
      from_status: result.from_status,
      to_status: result.to_status,
    });
  } catch (error: any) {
    console.error('[transition] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 },
    );
  }
}
