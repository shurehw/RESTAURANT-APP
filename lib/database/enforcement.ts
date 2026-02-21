/**
 * OpSOS Enforcement Engine - Unified Action Center
 *
 * Data access layer for violations, actions, and blocks.
 * Ingests violations from any source and routes to appropriate enforcement actions.
 *
 * This is the V2 unified system - eventually will replace control-plane.ts
 */

import { createClient } from '@/lib/supabase/server';
import type { ViolationStatus } from '@/lib/enforcement/state-machine';

// ============================================================================
// Types
// ============================================================================

export type ViolationType =
  | 'comp_exception'
  | 'sales_pace'
  | 'greeting_delay'
  | 'staffing_gap';

export type ViolationSeverity = 'info' | 'warning' | 'critical';

export type { ViolationStatus } from '@/lib/enforcement/state-machine';

export type ActionType =
  | 'alert'
  | 'block'
  | 'require_override'
  | 'escalate';

export type ExecutionStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'dismissed';

export type BlockType =
  | 'manager_assignment'
  | 'comp_approval'
  | 'section_opening'
  | 'schedule_publish';

export interface Violation {
  id: string;
  org_id: string;
  venue_id: string | null;
  violation_type: ViolationType;
  severity: ViolationSeverity;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  source_table: string | null;
  source_id: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  business_date: string;
  shift_period: string | null;
  created_at: string;
  updated_at: string;
  // State machine fields
  status: ViolationStatus;
  ack_at: string | null;
  ack_by: string | null;
  action_at: string | null;
  action_by: string | null;
  action_summary: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verification_required: boolean;
  waived_at: string | null;
  waived_by: string | null;
  waiver_reason: string | null;
  // Evidence + impact
  policy_snapshot: Record<string, any> | null;
  evidence: Record<string, any> | null;
  derived_metrics: Record<string, any> | null;
  estimated_impact_usd: number | null;
  impact_confidence: 'high' | 'medium' | 'low' | null;
  impact_inputs: Record<string, any> | null;
  // Escalation
  escalation_level: number;
  escalated_at: string | null;
  recurrence_count: number;
}

export interface Action {
  id: string;
  violation_id: string;
  action_type: ActionType;
  action_target: string;
  message: string;
  action_data: Record<string, any>;
  scheduled_for: string;
  executed_at: string | null;
  execution_status: ExecutionStatus;
  execution_result: Record<string, any> | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  dismiss_reason: string | null;
  created_at: string;
}

export interface ActionTemplate {
  id: string;
  org_id: string;
  violation_type: ViolationType;
  severity: ViolationSeverity;
  action_type: ActionType;
  action_target: string;
  message_template: string;
  enabled: boolean;
  conditions: Record<string, any>;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Block {
  id: string;
  violation_id: string;
  org_id: string;
  block_type: BlockType;
  blocked_entity_id: string | null;
  blocked_entity_type: string | null;
  reason: string;
  active: boolean;
  override_required: boolean;
  override_authority: string | null;
  override_requested_at: string | null;
  override_requested_by: string | null;
  override_request_reason: string | null;
  lifted_at: string | null;
  lifted_by: string | null;
  lift_reason: string | null;
  created_at: string;
}

export interface CreateViolationInput {
  org_id: string;
  venue_id?: string;
  violation_type: ViolationType;
  severity: ViolationSeverity;
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  source_table?: string;
  source_id?: string;
  business_date: string;
  shift_period?: string;
  // Evidence + impact (optional, populated by enforcement cron)
  policy_snapshot?: Record<string, any>;
  evidence?: Record<string, any>;
  derived_metrics?: Record<string, any>;
  estimated_impact_usd?: number;
  impact_confidence?: 'high' | 'medium' | 'low';
  impact_inputs?: Record<string, any>;
}

export interface CreateActionInput {
  violation_id: string;
  action_type: ActionType;
  action_target: string;
  message: string;
  action_data?: Record<string, any>;
  scheduled_for?: string;
}

export interface CreateBlockInput {
  violation_id: string;
  org_id: string;
  block_type: BlockType;
  blocked_entity_id?: string;
  blocked_entity_type?: string;
  reason: string;
  override_required?: boolean;
  override_authority?: string;
}

// ============================================================================
// Violations
// ============================================================================

/**
 * Create a new violation
 * This is the entry point for all enforcement sources
 */
export async function createViolation(
  input: CreateViolationInput
): Promise<Violation> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('control_plane_violations')
    .insert({
      org_id: input.org_id,
      venue_id: input.venue_id || null,
      violation_type: input.violation_type,
      severity: input.severity,
      title: input.title,
      description: input.description || null,
      metadata: input.metadata || {},
      source_table: input.source_table || null,
      source_id: input.source_id || null,
      business_date: input.business_date,
      shift_period: input.shift_period || null,
      status: 'open',
      verification_required: input.severity === 'critical',
      policy_snapshot: input.policy_snapshot || null,
      evidence: input.evidence || null,
      derived_metrics: input.derived_metrics || null,
      estimated_impact_usd: input.estimated_impact_usd || null,
      impact_confidence: input.impact_confidence || null,
      impact_inputs: input.impact_inputs || null,
      escalation_level: 0,
      recurrence_count: 0,
    })
    .select()
    .single();

  if (error) throw error;

  // Insert created event
  await supabase.from('violation_events').insert({
    violation_id: data.id,
    event_type: 'created',
    to_status: 'open',
    occurred_at: new Date().toISOString(),
  });

  return data;
}

/**
 * Get active violations for org (optionally filtered by severity)
 */
export async function getActiveViolations(
  orgId: string,
  severity?: ViolationSeverity
): Promise<any[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_active_violations', {
    p_org_id: orgId,
    p_severity: severity || null,
  });

  if (error) throw error;
  return data || [];
}

/**
 * Get violations for a specific date range
 */
export async function getViolationsByDateRange(
  orgId: string,
  startDate: string,
  endDate: string,
  options?: {
    venueId?: string;
    violationType?: ViolationType;
    severity?: ViolationSeverity;
  }
): Promise<Violation[]> {
  const supabase = await createClient();

  let query = supabase
    .from('control_plane_violations')
    .select('*')
    .eq('org_id', orgId)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .order('detected_at', { ascending: false });

  if (options?.venueId) {
    query = query.eq('venue_id', options.venueId);
  }
  if (options?.violationType) {
    query = query.eq('violation_type', options.violationType);
  }
  if (options?.severity) {
    query = query.eq('severity', options.severity);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Resolve a violation.
 * Uses legacy resolve path for backward compatibility — auto-transitions through
 * intermediate states if the violation hasn't gone through the full lifecycle.
 */
export async function resolveViolation(
  violationId: string,
  resolvedBy: string,
  resolutionNote?: string
): Promise<void> {
  const supabase = await createClient();

  const { legacyResolve } = await import('@/lib/enforcement/state-machine');
  const result = await legacyResolve(supabase, violationId, resolvedBy, resolutionNote);

  if (!result.success) {
    throw new Error(result.error || 'Failed to resolve violation');
  }

  // Keep legacy audit log for compatibility
  await supabase.from('control_plane_violations_audit').insert({
    violation_id: violationId,
    action: 'resolved',
    changed_by: resolvedBy,
    changes: { resolution_note: resolutionNote },
  });
}

// ============================================================================
// Actions
// ============================================================================

/**
 * Create an action for a violation
 */
export async function createAction(
  input: CreateActionInput
): Promise<Action> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('control_plane_actions')
    .insert({
      violation_id: input.violation_id,
      action_type: input.action_type,
      action_target: input.action_target,
      message: input.message,
      action_data: input.action_data || {},
      scheduled_for: input.scheduled_for || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get pending actions (for cron processor)
 */
export async function getPendingActions(limit = 100): Promise<Action[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('control_plane_actions')
    .select('*')
    .is('executed_at', null)
    .is('dismissed_at', null)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Mark action as executed
 */
export async function markActionExecuted(
  actionId: string,
  result?: Record<string, any>
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('control_plane_actions')
    .update({
      executed_at: new Date().toISOString(),
      execution_status: 'delivered',
      execution_result: result || null,
    })
    .eq('id', actionId);

  if (error) throw error;
}

/**
 * Mark action as failed
 */
export async function markActionFailed(
  actionId: string,
  error: any
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('control_plane_actions')
    .update({
      executed_at: new Date().toISOString(),
      execution_status: 'failed',
      execution_result: { error: String(error) },
    })
    .eq('id', actionId);
}

/**
 * Dismiss an action (user-initiated)
 */
export async function dismissAction(
  actionId: string,
  dismissedBy: string,
  reason?: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('control_plane_actions')
    .update({
      dismissed_by: dismissedBy,
      dismissed_at: new Date().toISOString(),
      dismiss_reason: reason || null,
      execution_status: 'dismissed',
    })
    .eq('id', actionId);

  if (error) throw error;
}

// ============================================================================
// Action Templates
// ============================================================================

/**
 * Get matching templates for a violation
 */
export async function getMatchingTemplates(
  orgId: string,
  violationType: ViolationType,
  severity: ViolationSeverity
): Promise<ActionTemplate[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('control_plane_action_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('violation_type', violationType)
    .eq('severity', severity)
    .eq('enabled', true);

  if (error) throw error;
  return data || [];
}

/**
 * Create actions from templates (called after violation creation)
 */
export async function createActionsFromTemplates(
  violation: Violation
): Promise<Action[]> {
  const templates = await getMatchingTemplates(
    violation.org_id,
    violation.violation_type,
    violation.severity
  );

  const actions: Action[] = [];

  for (const template of templates) {
    // Check template conditions
    if (!evaluateTemplateConditions(template.conditions, violation)) {
      continue;
    }

    // Interpolate message template
    const message = interpolateTemplate(template.message_template, violation);
    const target = interpolateTemplate(template.action_target, violation);

    const action = await createAction({
      violation_id: violation.id,
      action_type: template.action_type,
      action_target: target,
      message,
      action_data: { template_id: template.id },
    });

    actions.push(action);
  }

  return actions;
}

/**
 * Evaluate template conditions against violation metadata
 */
function evaluateTemplateConditions(
  conditions: Record<string, any>,
  violation: Violation
): boolean {
  // Simple condition evaluation (extend as needed)
  if (conditions.min_threshold !== undefined) {
    const value = violation.metadata.value || 0;
    if (value < conditions.min_threshold) return false;
  }

  if (conditions.only_during_service) {
    // Check if violation occurred during service hours (would need more context)
    // For now, always true
  }

  return true;
}

/**
 * Interpolate template variables
 * Supports: {{venue_name}}, {{metadata.key}}, etc.
 */
function interpolateTemplate(
  template: string,
  violation: Violation
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    // Handle nested keys like "metadata.gap"
    const value = key.split('.').reduce((obj: any, k: string) => obj?.[k], violation);
    return value !== undefined ? String(value) : match;
  });
}

// ============================================================================
// Blocks
// ============================================================================

/**
 * Create a block
 */
export async function createBlock(input: CreateBlockInput): Promise<Block> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('control_plane_blocks')
    .insert({
      violation_id: input.violation_id,
      org_id: input.org_id,
      block_type: input.block_type,
      blocked_entity_id: input.blocked_entity_id || null,
      blocked_entity_type: input.blocked_entity_type || null,
      reason: input.reason,
      override_required: input.override_required ?? false,
      override_authority: input.override_authority || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Audit log
  await supabase.from('control_plane_blocks_audit').insert({
    block_id: data.id,
    action: 'created',
    changes: { reason: input.reason },
  });

  return data;
}

/**
 * Check if entity is blocked
 */
export async function isBlocked(
  blockType: BlockType,
  entityId: string
): Promise<{
  blocked: boolean;
  reason?: string;
  override_required?: boolean;
  override_authority?: string;
} | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('is_blocked', {
    p_block_type: blockType,
    p_entity_id: entityId,
  });

  if (error) throw error;
  return data?.[0] || null;
}

/**
 * Get all active blocks
 */
export async function getActiveBlocks(
  orgId: string,
  options?: {
    blockType?: BlockType;
    entityId?: string;
  }
): Promise<Block[]> {
  const supabase = await createClient();

  let query = supabase
    .from('control_plane_blocks')
    .select('*')
    .eq('org_id', orgId)
    .eq('active', true);

  if (options?.blockType) {
    query = query.eq('block_type', options.blockType);
  }
  if (options?.entityId) {
    query = query.eq('blocked_entity_id', options.entityId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Lift a block
 */
export async function liftBlock(
  blockId: string,
  liftedBy: string,
  liftReason?: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('control_plane_blocks')
    .update({
      active: false,
      lifted_at: new Date().toISOString(),
      lifted_by: liftedBy,
      lift_reason: liftReason || null,
    })
    .eq('id', blockId);

  if (error) throw error;

  // Audit log
  await supabase.from('control_plane_blocks_audit').insert({
    block_id: blockId,
    action: 'lifted',
    changed_by: liftedBy,
    changes: { lift_reason: liftReason },
  });
}

/**
 * Request override for a block
 */
export async function requestBlockOverride(
  blockId: string,
  requestedBy: string,
  reason: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('control_plane_blocks')
    .update({
      override_requested_at: new Date().toISOString(),
      override_requested_by: requestedBy,
      override_request_reason: reason,
    })
    .eq('id', blockId);

  if (error) throw error;

  // Audit log
  await supabase.from('control_plane_blocks_audit').insert({
    block_id: blockId,
    action: 'override_requested',
    changed_by: requestedBy,
    changes: { reason },
  });
}
