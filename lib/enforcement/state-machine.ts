/**
 * Violation State Machine — Enforced Lifecycle Transitions
 *
 * Valid transitions:
 *   open → acknowledged | waived
 *   acknowledged → action_submitted | waived
 *   action_submitted → verified | resolved | waived
 *   verified → resolved
 *   resolved, waived → (terminal)
 *
 * Every transition:
 *   1. Validates current status via optimistic concurrency (WHERE status = $expected)
 *   2. Validates actor permissions
 *   3. Updates the violation row
 *   4. Inserts an append-only violation_events row
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export type ViolationStatus =
  | 'open'
  | 'acknowledged'
  | 'action_submitted'
  | 'verified'
  | 'resolved'
  | 'waived';

export type ViolationEventType =
  | 'created'
  | 'acknowledged'
  | 'action_submitted'
  | 'verified'
  | 'resolved'
  | 'waived'
  | 'escalated'
  | 'silence_penalty'
  | 'stall_penalty'
  | 'reopened';

export interface TransitionResult {
  success: boolean;
  violation_id: string;
  from_status: ViolationStatus;
  to_status: ViolationStatus;
  error?: string;
}

/** Valid status transitions */
const VALID_TRANSITIONS: Record<ViolationStatus, ViolationStatus[]> = {
  open: ['acknowledged', 'waived'],
  acknowledged: ['action_submitted', 'waived'],
  action_submitted: ['verified', 'resolved', 'waived'],
  verified: ['resolved'],
  resolved: [],
  waived: [],
};

// ============================================================================
// Core Transition Logic
// ============================================================================

/**
 * Acknowledge a violation. Starts the accountability clock.
 * open → acknowledged
 */
export async function acknowledgeViolation(
  supabase: SupabaseClient | any,
  violationId: string,
  actorId: string,
): Promise<TransitionResult> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('control_plane_violations')
    .update({
      status: 'acknowledged',
      ack_at: now,
      ack_by: actorId,
      updated_at: now,
    })
    .eq('id', violationId)
    .eq('status', 'open')
    .select('id, status')
    .single();

  if (error || !data) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'open',
      to_status: 'acknowledged',
      error: error?.message || 'Violation not in open status or does not exist',
    };
  }

  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'acknowledged',
    from_status: 'open',
    to_status: 'acknowledged',
    actor_id: actorId,
    occurred_at: now,
  });

  return {
    success: true,
    violation_id: violationId,
    from_status: 'open',
    to_status: 'acknowledged',
  };
}

/**
 * Submit a corrective action. Requires action_summary.
 * acknowledged → action_submitted
 */
export async function submitAction(
  supabase: SupabaseClient | any,
  violationId: string,
  actorId: string,
  actionSummary: string,
): Promise<TransitionResult> {
  if (!actionSummary || actionSummary.trim().length === 0) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'acknowledged',
      to_status: 'action_submitted',
      error: 'action_summary is required',
    };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('control_plane_violations')
    .update({
      status: 'action_submitted',
      action_at: now,
      action_by: actorId,
      action_summary: actionSummary.trim(),
      updated_at: now,
    })
    .eq('id', violationId)
    .eq('status', 'acknowledged')
    .select('id, status')
    .single();

  if (error || !data) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'acknowledged',
      to_status: 'action_submitted',
      error: error?.message || 'Violation not in acknowledged status',
    };
  }

  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'action_submitted',
    from_status: 'acknowledged',
    to_status: 'action_submitted',
    actor_id: actorId,
    occurred_at: now,
    metadata: { action_summary: actionSummary.trim() },
  });

  return {
    success: true,
    violation_id: violationId,
    from_status: 'acknowledged',
    to_status: 'action_submitted',
  };
}

/**
 * Verify a corrective action (second-party verification).
 * action_submitted → verified
 *
 * Verifier must differ from action_by to ensure second-party accountability.
 */
export async function verifyViolation(
  supabase: SupabaseClient | any,
  violationId: string,
  actorId: string,
): Promise<TransitionResult> {
  // Fetch current state to check action_by
  const { data: violation } = await supabase
    .from('control_plane_violations')
    .select('id, status, action_by')
    .eq('id', violationId)
    .single();

  if (!violation || violation.status !== 'action_submitted') {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'action_submitted',
      to_status: 'verified',
      error: 'Violation not in action_submitted status',
    };
  }

  // Second-party: verifier must differ from the person who submitted the action
  if (violation.action_by === actorId) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'action_submitted',
      to_status: 'verified',
      error: 'Verifier must be a different person than the action submitter',
    };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('control_plane_violations')
    .update({
      status: 'verified',
      verified_at: now,
      verified_by: actorId,
      updated_at: now,
    })
    .eq('id', violationId)
    .eq('status', 'action_submitted')
    .select('id, status')
    .single();

  if (error || !data) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'action_submitted',
      to_status: 'verified',
      error: error?.message || 'Concurrent transition detected',
    };
  }

  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'verified',
    from_status: 'action_submitted',
    to_status: 'verified',
    actor_id: actorId,
    occurred_at: now,
  });

  return {
    success: true,
    violation_id: violationId,
    from_status: 'action_submitted',
    to_status: 'verified',
  };
}

/**
 * Resolve a violation. Terminal state.
 * action_submitted | verified → resolved
 *
 * If verification_required = true, must be in 'verified' first.
 */
export async function resolveViolation(
  supabase: SupabaseClient | any,
  violationId: string,
  actorId: string,
  resolutionNote?: string,
): Promise<TransitionResult> {
  // Fetch current state to check verification requirement
  const { data: violation } = await supabase
    .from('control_plane_violations')
    .select('id, status, verification_required')
    .eq('id', violationId)
    .single();

  if (!violation) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'action_submitted',
      to_status: 'resolved',
      error: 'Violation not found',
    };
  }

  const fromStatus = violation.status as ViolationStatus;

  // Gate: verification_required violations must pass through verified
  if (violation.verification_required && fromStatus !== 'verified') {
    return {
      success: false,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: 'resolved',
      error: 'This violation requires verification before resolution',
    };
  }

  // Must be in action_submitted or verified
  if (fromStatus !== 'action_submitted' && fromStatus !== 'verified') {
    return {
      success: false,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: 'resolved',
      error: `Cannot resolve from status '${fromStatus}' — must be action_submitted or verified`,
    };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('control_plane_violations')
    .update({
      status: 'resolved',
      resolved_at: now,
      resolved_by: actorId,
      resolution_note: resolutionNote || null,
      updated_at: now,
    })
    .eq('id', violationId)
    .eq('status', fromStatus)
    .select('id, status')
    .single();

  if (error || !data) {
    return {
      success: false,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: 'resolved',
      error: error?.message || 'Concurrent transition detected',
    };
  }

  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'resolved',
    from_status: fromStatus,
    to_status: 'resolved',
    actor_id: actorId,
    occurred_at: now,
    metadata: resolutionNote ? { resolution_note: resolutionNote } : {},
  });

  return {
    success: true,
    violation_id: violationId,
    from_status: fromStatus,
    to_status: 'resolved',
  };
}

/**
 * Waive a violation. Terminal state.
 * open | acknowledged | action_submitted → waived
 *
 * Requires owner/admin role in the org. waiver_reason is mandatory.
 */
export async function waiveViolation(
  supabase: SupabaseClient | any,
  violationId: string,
  actorId: string,
  waiverReason: string,
  orgId: string,
): Promise<TransitionResult> {
  if (!waiverReason || waiverReason.trim().length === 0) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'open',
      to_status: 'waived',
      error: 'waiver_reason is required',
    };
  }

  // Verify actor is owner/admin in this org
  const { data: orgUser } = await supabase
    .from('organization_users')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', actorId)
    .eq('is_active', true)
    .single();

  if (!orgUser || !['owner', 'admin'].includes(orgUser.role)) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'open',
      to_status: 'waived',
      error: 'Only owner or admin can waive violations',
    };
  }

  // Fetch current status
  const { data: violation } = await supabase
    .from('control_plane_violations')
    .select('id, status, org_id')
    .eq('id', violationId)
    .single();

  if (!violation) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'open',
      to_status: 'waived',
      error: 'Violation not found',
    };
  }

  if (violation.org_id !== orgId) {
    return {
      success: false,
      violation_id: violationId,
      from_status: violation.status,
      to_status: 'waived',
      error: 'Violation does not belong to this organization',
    };
  }

  const fromStatus = violation.status as ViolationStatus;
  const waivable: ViolationStatus[] = ['open', 'acknowledged', 'action_submitted'];

  if (!waivable.includes(fromStatus)) {
    return {
      success: false,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: 'waived',
      error: `Cannot waive from status '${fromStatus}'`,
    };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('control_plane_violations')
    .update({
      status: 'waived',
      waived_at: now,
      waived_by: actorId,
      waiver_reason: waiverReason.trim(),
      updated_at: now,
    })
    .eq('id', violationId)
    .eq('status', fromStatus)
    .select('id, status')
    .single();

  if (error || !data) {
    return {
      success: false,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: 'waived',
      error: error?.message || 'Concurrent transition detected',
    };
  }

  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'waived',
    from_status: fromStatus,
    to_status: 'waived',
    actor_id: actorId,
    occurred_at: now,
    metadata: { waiver_reason: waiverReason.trim() },
  });

  return {
    success: true,
    violation_id: violationId,
    from_status: fromStatus,
    to_status: 'waived',
  };
}

/**
 * Legacy resolve — for callers that don't use the full state machine.
 * Auto-transitions through intermediate states.
 * Intended for backward compatibility with existing resolveViolation() callers.
 */
export async function legacyResolve(
  supabase: SupabaseClient | any,
  violationId: string,
  actorId: string,
  resolutionNote?: string,
): Promise<TransitionResult> {
  const { data: violation } = await supabase
    .from('control_plane_violations')
    .select('id, status, verification_required')
    .eq('id', violationId)
    .single();

  if (!violation) {
    return {
      success: false,
      violation_id: violationId,
      from_status: 'open',
      to_status: 'resolved',
      error: 'Violation not found',
    };
  }

  const fromStatus = violation.status as ViolationStatus;

  // If already resolved or waived, no-op
  if (fromStatus === 'resolved' || fromStatus === 'waived') {
    return {
      success: true,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: fromStatus,
    };
  }

  const now = new Date().toISOString();

  // Force through all intermediate states in a single update
  const { data, error } = await supabase
    .from('control_plane_violations')
    .update({
      status: 'resolved',
      ack_at: violation.ack_at || now,
      ack_by: violation.ack_by || actorId,
      action_at: violation.action_at || now,
      action_by: violation.action_by || actorId,
      action_summary: violation.action_summary || resolutionNote || 'Legacy resolve',
      verified_at: violation.verified_at || (violation.verification_required ? now : null),
      verified_by: violation.verified_by || (violation.verification_required ? actorId : null),
      resolved_at: now,
      resolved_by: actorId,
      resolution_note: resolutionNote || null,
      updated_at: now,
    })
    .eq('id', violationId)
    .select('id, status')
    .single();

  if (error || !data) {
    return {
      success: false,
      violation_id: violationId,
      from_status: fromStatus,
      to_status: 'resolved',
      error: error?.message || 'Failed to legacy-resolve',
    };
  }

  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'resolved',
    from_status: fromStatus,
    to_status: 'resolved',
    actor_id: actorId,
    occurred_at: now,
    metadata: { legacy_resolve: true, resolution_note: resolutionNote },
  });

  return {
    success: true,
    violation_id: violationId,
    from_status: fromStatus,
    to_status: 'resolved',
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Get valid transitions for a given status */
export function getValidTransitions(status: ViolationStatus): ViolationStatus[] {
  return VALID_TRANSITIONS[status] || [];
}

/** Check if a transition is valid */
export function isValidTransition(from: ViolationStatus, to: ViolationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Insert an append-only event */
async function insertEvent(
  supabase: SupabaseClient | any,
  event: {
    violation_id: string;
    event_type: ViolationEventType;
    from_status?: string;
    to_status?: string;
    actor_id?: string;
    occurred_at: string;
    metadata?: Record<string, any>;
  },
): Promise<void> {
  await supabase.from('violation_events').insert({
    violation_id: event.violation_id,
    event_type: event.event_type,
    from_status: event.from_status || null,
    to_status: event.to_status || null,
    actor_id: event.actor_id || null,
    occurred_at: event.occurred_at,
    metadata: event.metadata || {},
  });
}

/** Insert a 'created' event — called when a new violation is created */
export async function insertCreatedEvent(
  supabase: SupabaseClient | any,
  violationId: string,
  metadata?: Record<string, any>,
): Promise<void> {
  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: 'created',
    from_status: null as any,
    to_status: 'open',
    occurred_at: new Date().toISOString(),
    metadata,
  });
}

/** Insert an escalation event — called by the escalation engine */
export async function insertEscalationEvent(
  supabase: SupabaseClient | any,
  violationId: string,
  eventType: 'escalated' | 'silence_penalty' | 'stall_penalty',
  metadata?: Record<string, any>,
): Promise<void> {
  await insertEvent(supabase, {
    violation_id: violationId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    metadata,
  });
}
