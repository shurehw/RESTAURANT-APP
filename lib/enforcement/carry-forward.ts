/**
 * Carry-Forward Engine
 *
 * Scans both enforcement pipelines (manager_actions + feedback_objects)
 * for overdue/stale items, auto-escalates based on time rules, and
 * provides the unified data layer for the Preshift Briefing page.
 *
 * Escalation chain: venue_manager → gm → corporate
 * Time rules:
 *   manager_actions: urgent >24h, high >48h, medium >72h, low >7d
 *   feedback_objects: past due_at, or open >7d
 */

import { getServiceClient } from '@/lib/supabase/service';
import { runVerifications, type VerificationResult } from '@/lib/feedback/verification-evaluator';
import { broadcastNotification } from '@/lib/notifications/dispatcher';

// ── Types ──────────────────────────────────────────────────────

export interface UnifiedItem {
  source_table: 'manager_action' | 'feedback_object';
  source_id: string;
  venue_id: string;
  business_date: string;
  title: string;
  description: string;
  action_required: string;
  priority_rank: number;
  priority_label: string;
  severity: string;
  category: string;
  status: string;
  assigned_to: string | null;
  assigned_role: string | null;
  current_owner: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  escalation_reason: string | null;
  age_hours: number;
  metadata: Record<string, any> | null;
}

export interface PreshiftSummary {
  items: UnifiedItem[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    carried_forward: number;
    new_today: number;
    escalated: number;
  };
  briefing: {
    id: string;
    reviewed: boolean;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
  } | null;
  attestation_blocked: boolean;
}

export interface CarryForwardResult {
  manager_actions_escalated: number;
  feedback_objects_escalated: number;
  escalation_log_entries: number;
  verification: VerificationResult | null;
  errors: string[];
}

// ── Escalation Config ──────────────────────────────────────────

const ESCALATION_CHAIN: Record<string, string> = {
  venue_manager: 'gm',
  gm: 'corporate',
  agm: 'gm',
  // Legacy text values from manager_actions
  Manager: 'GM',
  GM: 'corporate',
};

/** Hours before auto-escalation by manager_actions priority */
const MA_ESCALATION_HOURS: Record<string, number> = {
  urgent: 24,
  high: 48,
  medium: 72,
  low: 168,
};

/** Absolute age (hours) before escalation to corporate regardless of role */
const CORPORATE_ESCALATION_HOURS = 168; // 7 days

const TERMINAL_ROLES = new Set(['corporate', 'Corporate']);

// ── Core Engine ────────────────────────────────────────────────

/**
 * Main entry point — run the full carry-forward scan and auto-escalation.
 * Called by the cron endpoint.
 */
export async function runCarryForward(): Promise<CarryForwardResult> {
  const errors: string[] = [];
  let maEscalated = 0;
  let foEscalated = 0;
  let logEntries = 0;

  try {
    const maResult = await escalateManagerActions();
    maEscalated = maResult.escalated;
    logEntries += maResult.logEntries;
    errors.push(...maResult.errors);
  } catch (err: any) {
    errors.push(`Manager actions escalation failed: ${err.message}`);
  }

  try {
    const foResult = await escalateFeedbackObjects();
    foEscalated = foResult.escalated;
    logEntries += foResult.logEntries;
    errors.push(...foResult.errors);
  } catch (err: any) {
    errors.push(`Feedback objects escalation failed: ${err.message}`);
  }

  // Run verification evaluator (checks resolved items against their specs)
  let verification: VerificationResult | null = null;
  try {
    verification = await runVerifications();
    errors.push(...verification.errors);
  } catch (err: any) {
    errors.push(`Verification evaluation failed: ${err.message}`);
  }

  return {
    manager_actions_escalated: maEscalated,
    feedback_objects_escalated: foEscalated,
    escalation_log_entries: logEntries,
    verification,
    errors,
  };
}

// ── Manager Actions Escalation ─────────────────────────────────

async function escalateManagerActions(): Promise<{
  escalated: number;
  logEntries: number;
  errors: string[];
}> {
  const supabase = getServiceClient();
  const errors: string[] = [];
  let escalated = 0;
  let logEntries = 0;

  // Fetch active manager actions that haven't been escalated to corporate
  const { data: actions, error } = await (supabase as any)
    .from('manager_actions')
    .select('id, venue_id, business_date, priority, status, assigned_role, escalated_to, created_at, title')
    .in('status', ['pending', 'in_progress'])
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());

  if (error) {
    errors.push(`Failed to fetch manager actions: ${error.message}`);
    return { escalated, logEntries, errors };
  }

  if (!actions || actions.length === 0) {
    return { escalated, logEntries, errors };
  }

  const now = Date.now();

  for (const action of actions) {
    const ageHours = (now - new Date(action.created_at).getTime()) / (1000 * 60 * 60);
    const threshold = MA_ESCALATION_HOURS[action.priority] || 168;
    const currentOwner = action.escalated_to || action.assigned_role || 'venue_manager';

    // Skip if already at terminal role
    if (TERMINAL_ROLES.has(currentOwner)) continue;

    // Check if overdue based on priority threshold
    const isOverdue = ageHours >= threshold;
    // Check if old enough for corporate escalation
    const isCorporateAge = ageHours >= CORPORATE_ESCALATION_HOURS;

    if (!isOverdue && !isCorporateAge) continue;

    const nextRole = isCorporateAge ? 'corporate' : (ESCALATION_CHAIN[currentOwner] || 'corporate');
    const reason = isCorporateAge
      ? `auto:age_${Math.round(ageHours)}h_corporate`
      : `auto:overdue_${Math.round(ageHours)}h_${action.priority}`;

    try {
      // Update manager action
      const { error: updateErr } = await (supabase as any)
        .from('manager_actions')
        .update({
          status: 'escalated',
          escalated_at: new Date().toISOString(),
          escalated_to: nextRole,
          escalation_reason: reason,
        })
        .eq('id', action.id);

      if (updateErr) {
        errors.push(`Failed to escalate manager action ${action.id}: ${updateErr.message}`);
        continue;
      }

      // Log escalation
      const { error: logErr } = await (supabase as any)
        .from('escalation_log')
        .insert({
          source_table: 'manager_actions',
          source_id: action.id,
          from_role: currentOwner,
          to_role: nextRole,
          reason,
          venue_id: action.venue_id,
          business_date: action.business_date,
        });

      if (logErr) {
        errors.push(`Failed to log escalation for ${action.id}: ${logErr.message}`);
      } else {
        logEntries++;
      }

      // Notify the escalation target
      try {
        const { data: venue } = await (supabase as any)
          .from('venues')
          .select('organization_id')
          .eq('id', action.venue_id)
          .maybeSingle();

        if (venue?.organization_id) {
          await broadcastNotification({
            orgId: venue.organization_id,
            venueId: action.venue_id,
            targetRole: nextRole,
            type: 'escalation',
            severity: 'warning',
            title: `Escalated: ${action.title || 'Action Item'}`,
            body: `"${action.title || 'Action item'}" has been escalated to ${nextRole} after ${reason.replace('auto:', '')}.`,
            actionUrl: '/preshift',
            sourceTable: 'manager_action',
            sourceId: action.id,
          });
        }
      } catch (notifyErr: any) {
        errors.push(`Notification failed for ${action.id}: ${notifyErr.message}`);
      }

      escalated++;
    } catch (err: any) {
      errors.push(`Error escalating manager action ${action.id}: ${err.message}`);
    }
  }

  return { escalated, logEntries, errors };
}

// ── Feedback Objects Escalation ────────────────────────────────

async function escalateFeedbackObjects(): Promise<{
  escalated: number;
  logEntries: number;
  errors: string[];
}> {
  const supabase = getServiceClient();
  const errors: string[] = [];
  let escalated = 0;
  let logEntries = 0;

  const { data: objects, error } = await (supabase as any)
    .from('feedback_objects')
    .select('id, org_id, venue_id, business_date, severity, owner_role, escalated_to_role, due_at, created_at, title')
    .in('status', ['open', 'acknowledged', 'in_progress']);

  if (error) {
    errors.push(`Failed to fetch feedback objects: ${error.message}`);
    return { escalated, logEntries, errors };
  }

  if (!objects || objects.length === 0) {
    return { escalated, logEntries, errors };
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();

  for (const obj of objects) {
    const ageHours = (now - new Date(obj.created_at).getTime()) / (1000 * 60 * 60);
    const currentOwner = obj.escalated_to_role || obj.owner_role || 'venue_manager';

    if (TERMINAL_ROLES.has(currentOwner)) continue;

    // Check due_at
    const isPastDue = obj.due_at && new Date(obj.due_at).getTime() < now;
    const isCorporateAge = ageHours >= CORPORATE_ESCALATION_HOURS;

    if (!isPastDue && !isCorporateAge) continue;

    const nextRole = isCorporateAge ? 'corporate' : (ESCALATION_CHAIN[currentOwner] || 'corporate');
    const reason = isCorporateAge
      ? `auto:age_${Math.round(ageHours)}h_corporate`
      : `auto:past_due_${Math.round(ageHours)}h`;

    try {
      const { error: updateErr } = await (supabase as any)
        .from('feedback_objects')
        .update({
          status: 'escalated',
          escalated_at: nowIso,
          escalated_to_role: nextRole,
          escalated_reason: reason,
          updated_at: nowIso,
        })
        .eq('id', obj.id);

      if (updateErr) {
        errors.push(`Failed to escalate feedback object ${obj.id}: ${updateErr.message}`);
        continue;
      }

      const { error: logErr } = await (supabase as any)
        .from('escalation_log')
        .insert({
          source_table: 'feedback_objects',
          source_id: obj.id,
          from_role: currentOwner,
          to_role: nextRole,
          reason,
          venue_id: obj.venue_id,
          business_date: obj.business_date,
        });

      if (logErr) {
        errors.push(`Failed to log escalation for feedback ${obj.id}: ${logErr.message}`);
      } else {
        logEntries++;
      }

      // Notify the escalation target
      try {
        const orgId = obj.org_id;
        if (orgId) {
          await broadcastNotification({
            orgId,
            venueId: obj.venue_id,
            targetRole: nextRole,
            type: 'escalation',
            severity: obj.severity === 'critical' ? 'critical' : 'warning',
            title: `Escalated: ${obj.title || 'Feedback Item'}`,
            body: `"${obj.title || 'Feedback item'}" has been escalated to ${nextRole} after ${reason.replace('auto:', '')}.`,
            actionUrl: '/preshift',
            sourceTable: 'feedback_object',
            sourceId: obj.id,
          });
        }
      } catch (notifyErr: any) {
        errors.push(`Notification failed for feedback ${obj.id}: ${notifyErr.message}`);
      }

      escalated++;
    } catch (err: any) {
      errors.push(`Error escalating feedback object ${obj.id}: ${err.message}`);
    }
  }

  return { escalated, logEntries, errors };
}

// ── Query Functions ────────────────────────────────────────────

/**
 * Get all active enforcement items for a venue from the unified view.
 */
export async function getUnifiedItems(
  venueId: string,
  limit = 100
): Promise<UnifiedItem[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('unified_enforcement_items')
    .select('*')
    .eq('venue_id', venueId)
    .order('priority_rank', { ascending: true })
    .order('age_hours', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[CarryForward] Failed to fetch unified items:', error);
    return [];
  }

  return data || [];
}

/**
 * Build the full preshift summary for a venue on a given business date.
 */
export async function getPreshiftSummary(
  venueId: string,
  businessDate: string
): Promise<PreshiftSummary> {
  const supabase = getServiceClient();

  // Fetch items and briefing in parallel
  const [items, briefingResult, gateResult] = await Promise.all([
    getUnifiedItems(venueId),
    (supabase as any)
      .from('preshift_briefings')
      .select('*')
      .eq('venue_id', venueId)
      .eq('business_date', businessDate)
      .maybeSingle(),
    checkAttestationGate(venueId, businessDate),
  ]);

  // Compute counts
  const counts = {
    total: items.length,
    critical: items.filter((i) => i.severity === 'critical').length,
    warning: items.filter((i) => i.severity === 'warning').length,
    info: items.filter((i) => i.severity === 'info').length,
    carried_forward: items.filter((i) => i.business_date < businessDate).length,
    new_today: items.filter((i) => i.business_date === businessDate).length,
    escalated: items.filter((i) => i.status === 'escalated').length,
  };

  const briefing = briefingResult.data
    ? {
        id: briefingResult.data.id,
        reviewed: briefingResult.data.reviewed_at !== null,
        reviewed_by: briefingResult.data.reviewed_by,
        reviewed_at: briefingResult.data.reviewed_at,
        review_notes: briefingResult.data.review_notes,
      }
    : null;

  return {
    items,
    counts,
    briefing,
    attestation_blocked: !gateResult,
  };
}

/**
 * Check if attestation can be submitted (no unresolved critical feedback).
 * Returns true if attestation is allowed.
 */
async function checkAttestationGate(
  venueId: string,
  businessDate: string
): Promise<boolean> {
  const supabase = getServiceClient();

  // Look up org_id from venue
  const { data: venue } = await (supabase as any)
    .from('venues')
    .select('organization_id')
    .eq('id', venueId)
    .single();

  if (!venue?.organization_id) return true;

  const { data: canSubmit } = await (supabase as any).rpc(
    'can_submit_attestation',
    {
      p_org_id: venue.organization_id,
      p_venue_id: venueId,
      p_business_date: businessDate,
    }
  );

  return canSubmit !== false;
}
