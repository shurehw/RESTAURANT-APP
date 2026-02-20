/**
 * Operator Intelligence — internal signals for owner/director eyes only
 *
 * Generates intelligence from:
 *   1. Unfulfilled commitments (manager promised X, didn't follow through)
 *   2. Recurring negative employee patterns (same person flagged 2+ times)
 *   3. Ownership alerts (low command score, avoidance flag, blame shifting)
 *
 * NOT visible to managers. Strict RLS on the table enforces this.
 */

import { getServiceClient } from '@/lib/supabase/service';
import type { OwnershipScores } from '@/lib/ai/signal-extractor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntelligenceType =
  | 'unfulfilled_commitment'
  | 'employee_pattern'
  | 'ownership_alert';

export type IntelligenceSeverity = 'info' | 'warning' | 'critical';
export type IntelligenceStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';

export interface OperatorIntelligenceRecord {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  intelligence_type: IntelligenceType;
  severity: IntelligenceSeverity;
  title: string;
  description: string;
  recommended_action: string | null;
  subject_manager_id: string | null;
  subject_manager_name: string | null;
  related_employees: string[];
  attestation_id: string | null;
  signal_id: string | null;
  source_data: Record<string, unknown>;
  status: IntelligenceStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
}

interface IntelligenceInsert {
  org_id: string;
  venue_id: string;
  business_date: string;
  intelligence_type: IntelligenceType;
  severity: IntelligenceSeverity;
  title: string;
  description: string;
  recommended_action?: string;
  subject_manager_id?: string;
  subject_manager_name?: string;
  related_employees?: string[];
  attestation_id?: string;
  signal_id?: string;
  source_data?: Record<string, unknown>;
  status: IntelligenceStatus;
}

// ---------------------------------------------------------------------------
// Generate intelligence from signals (called post-submit)
// ---------------------------------------------------------------------------

export interface GenerateIntelligenceInput {
  org_id: string;
  venue_id: string;
  venue_name: string;
  business_date: string;
  attestation_id: string;
  submitted_by?: string;
  submitted_by_name?: string;
  ownership?: OwnershipScores | null;
}

export async function generateIntelligence(
  input: GenerateIntelligenceInput,
): Promise<{ created: number; errors: string[] }> {
  const { getOpenCommitments, getEmployeeMentionHistory, markOverdueCommitments } =
    await import('@/lib/database/signal-outcomes');

  const supabase = getServiceClient();
  const errors: string[] = [];
  const items: IntelligenceInsert[] = [];

  // Update commitment statuses first
  try {
    await markOverdueCommitments(input.venue_id);
  } catch (err) {
    console.warn('[operator-intelligence] markOverdueCommitments failed:', err);
  }

  // -----------------------------------------------------------------------
  // 1. Unfulfilled commitments
  // -----------------------------------------------------------------------
  try {
    const commitments = await getOpenCommitments(input.venue_id, { limit: 10 });
    const overdue = commitments.filter(c => c.days_open >= 3);

    for (const c of overdue) {
      // Dedup: don't create another intel item for the same signal if one already exists and is active
      const { data: existing } = await (supabase as any)
        .from('operator_intelligence')
        .select('id')
        .eq('venue_id', input.venue_id)
        .eq('intelligence_type', 'unfulfilled_commitment')
        .contains('source_data', { signal_id: c.id })
        .in('status', ['active', 'acknowledged'])
        .limit(1);

      if (existing?.length > 0) continue;

      items.push({
        org_id: input.org_id,
        venue_id: input.venue_id,
        business_date: input.business_date,
        intelligence_type: 'unfulfilled_commitment',
        severity: c.days_open >= 7 ? 'critical' : 'warning',
        title: `Unfulfilled commitment — ${c.days_open}d overdue`,
        description: `Manager committed to: "${c.commitment_text}" on ${c.business_date}${c.entity_name ? ` (re: ${c.entity_name})` : ''}. ${c.days_open} days without follow-through.`,
        recommended_action: `Verify completion or escalate. Original commitment: "${c.commitment_text}"`,
        subject_manager_id: input.submitted_by,
        subject_manager_name: input.submitted_by_name,
        related_employees: c.entity_name ? [c.entity_name] : [],
        attestation_id: input.attestation_id,
        signal_id: c.id,
        source_data: { signal_id: c.id, commitment_text: c.commitment_text, days_open: c.days_open, source_field: c.source_field },
        status: 'active',
      });
    }
  } catch (err) {
    errors.push(`Commitment intelligence failed: ${(err as Error).message}`);
  }

  // -----------------------------------------------------------------------
  // 2. Recurring negative employee patterns
  // -----------------------------------------------------------------------
  try {
    const employees = await getEmployeeMentionHistory(input.venue_id, { days: 14, minMentions: 2 });
    const flagged = employees.filter(e => e.negative_count >= 2);

    for (const emp of flagged) {
      // Dedup: don't create another intel item for the same employee within 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existing } = await (supabase as any)
        .from('operator_intelligence')
        .select('id')
        .eq('venue_id', input.venue_id)
        .eq('intelligence_type', 'employee_pattern')
        .contains('source_data', { employee_name: emp.entity_name })
        .gte('created_at', weekAgo)
        .in('status', ['active', 'acknowledged'])
        .limit(1);

      if (existing?.length > 0) continue;

      items.push({
        org_id: input.org_id,
        venue_id: input.venue_id,
        business_date: input.business_date,
        intelligence_type: 'employee_pattern',
        severity: emp.negative_count >= 3 ? 'critical' : 'warning',
        title: `Recurring concern: ${emp.entity_name}`,
        description: `${emp.entity_name} flagged negatively ${emp.negative_count} times in 14 days (${emp.total_mentions} total mentions). Latest: "${emp.recent_contexts[0] || 'No detail'}"`,
        recommended_action: `Review performance pattern. Determine if coaching, corrective action, or schedule adjustment is warranted.`,
        subject_manager_id: input.submitted_by,
        subject_manager_name: input.submitted_by_name,
        related_employees: [emp.entity_name],
        attestation_id: input.attestation_id,
        source_data: {
          employee_name: emp.entity_name,
          total_mentions: emp.total_mentions,
          negative_count: emp.negative_count,
          positive_count: emp.positive_count,
          recent_contexts: emp.recent_contexts,
        },
        status: 'active',
      });
    }
  } catch (err) {
    errors.push(`Employee pattern intelligence failed: ${(err as Error).message}`);
  }

  // -----------------------------------------------------------------------
  // 3. Ownership alerts (low command score, avoidance, blame shifting)
  // -----------------------------------------------------------------------
  if (input.ownership) {
    const o = input.ownership;

    // Low command score
    if (o.overall_command_score <= 3) {
      items.push({
        org_id: input.org_id,
        venue_id: input.venue_id,
        business_date: input.business_date,
        intelligence_type: 'ownership_alert',
        severity: o.overall_command_score <= 2 ? 'critical' : 'warning',
        title: `Low operational ownership — ${o.overall_command_score}/10`,
        description: `${input.submitted_by_name || 'Manager'} scored ${o.overall_command_score}/10 on operational command. ${o.rationale || ''}`,
        recommended_action: `Review attestation quality. Consider whether this manager is engaged or checking a box.`,
        subject_manager_id: input.submitted_by,
        subject_manager_name: input.submitted_by_name,
        attestation_id: input.attestation_id,
        source_data: {
          overall_command_score: o.overall_command_score,
          narrative_depth: o.narrative_depth,
          ownership: o.ownership,
          variance_awareness: o.variance_awareness,
          signal_density: o.signal_density,
          avoidance_flag: o.avoidance_flag,
          blame_shift_flag: o.blame_shift_flag,
          rationale: o.rationale,
        },
        status: 'active',
      });
    }

    // Avoidance flag (even if command score is mid-range)
    if (o.avoidance_flag && o.overall_command_score > 3) {
      items.push({
        org_id: input.org_id,
        venue_id: input.venue_id,
        business_date: input.business_date,
        intelligence_type: 'ownership_alert',
        severity: 'warning',
        title: `Avoidance detected — vague language masking reality`,
        description: `${input.submitted_by_name || 'Manager'} used vague language that may be masking operational issues. Command score: ${o.overall_command_score}/10. ${o.rationale || ''}`,
        recommended_action: `Cross-reference tonight's data with the attestation. Determine if the narrative matches the numbers.`,
        subject_manager_id: input.submitted_by,
        subject_manager_name: input.submitted_by_name,
        attestation_id: input.attestation_id,
        source_data: {
          overall_command_score: o.overall_command_score,
          avoidance_flag: true,
          rationale: o.rationale,
        },
        status: 'active',
      });
    }

    // Blame shifting
    if (o.blame_shift_flag) {
      items.push({
        org_id: input.org_id,
        venue_id: input.venue_id,
        business_date: input.business_date,
        intelligence_type: 'ownership_alert',
        severity: 'warning',
        title: `Blame shifting detected`,
        description: `${input.submitted_by_name || 'Manager'} attributed outcomes to external factors without acknowledging management levers. ${o.rationale || ''}`,
        recommended_action: `Review whether external factors were genuinely beyond control or if management actions could have mitigated.`,
        subject_manager_id: input.submitted_by,
        subject_manager_name: input.submitted_by_name,
        attestation_id: input.attestation_id,
        source_data: {
          overall_command_score: o.overall_command_score,
          blame_shift_flag: true,
          rationale: o.rationale,
        },
        status: 'active',
      });
    }
  }

  // -----------------------------------------------------------------------
  // Insert
  // -----------------------------------------------------------------------
  if (items.length === 0) {
    return { created: 0, errors };
  }

  const { error } = await (supabase as any)
    .from('operator_intelligence')
    .insert(items);

  if (error) {
    errors.push(`Failed to insert ${items.length} intelligence items: ${error.message}`);
    return { created: 0, errors };
  }

  console.log(
    `[operator-intelligence] ${input.venue_name} ${input.business_date}: ${items.length} items ` +
    `(${items.filter(i => i.intelligence_type === 'unfulfilled_commitment').length} commitments, ` +
    `${items.filter(i => i.intelligence_type === 'employee_pattern').length} patterns, ` +
    `${items.filter(i => i.intelligence_type === 'ownership_alert').length} ownership)`,
  );

  return { created: items.length, errors };
}

// ---------------------------------------------------------------------------
// Query intelligence (owner/director only — enforced by RLS + API layer)
// ---------------------------------------------------------------------------

export async function getActiveIntelligence(
  orgId: string,
  options?: {
    venueId?: string;
    type?: IntelligenceType;
    severity?: IntelligenceSeverity;
    managerId?: string;
    limit?: number;
  },
): Promise<OperatorIntelligenceRecord[]> {
  const supabase = getServiceClient();
  const limit = options?.limit ?? 50;

  let query = (supabase as any)
    .from('operator_intelligence')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('severity', { ascending: true }) // critical first
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.venueId) query = query.eq('venue_id', options.venueId);
  if (options?.type) query = query.eq('intelligence_type', options.type);
  if (options?.severity) query = query.eq('severity', options.severity);
  if (options?.managerId) query = query.eq('subject_manager_id', options.managerId);

  const { data, error } = await query;
  if (error) {
    console.error('[operator-intelligence] getActiveIntelligence error:', error);
    return [];
  }

  return data || [];
}

export async function getIntelligenceSummary(
  orgId: string,
  venueId?: string,
): Promise<{ critical: number; warning: number; info: number; total: number }> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('operator_intelligence')
    .select('severity')
    .eq('org_id', orgId)
    .eq('status', 'active');

  if (venueId) query = query.eq('venue_id', venueId);

  const { data, error } = await query;
  if (error || !data) return { critical: 0, warning: 0, info: 0, total: 0 };

  const critical = data.filter((r: any) => r.severity === 'critical').length;
  const warning = data.filter((r: any) => r.severity === 'warning').length;
  const info = data.filter((r: any) => r.severity === 'info').length;

  return { critical, warning, info, total: data.length };
}

// ---------------------------------------------------------------------------
// Lifecycle management
// ---------------------------------------------------------------------------

export async function acknowledgeIntelligence(
  id: string,
  userId: string,
): Promise<boolean> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('operator_intelligence')
    .update({
      status: 'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return !error;
}

export async function resolveIntelligence(
  id: string,
  userId: string,
  note?: string,
): Promise<boolean> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('operator_intelligence')
    .update({
      status: 'resolved',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
      resolution_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return !error;
}

export async function dismissIntelligence(
  id: string,
  userId: string,
  note?: string,
): Promise<boolean> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('operator_intelligence')
    .update({
      status: 'dismissed',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
      resolution_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  return !error;
}
