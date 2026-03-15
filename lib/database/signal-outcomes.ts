/**
 * Signal Outcomes — queries for the accountability engine
 *
 * Links extracted signals to future data:
 *   - Open commitments that need follow-up
 *   - Employee mention history (who keeps getting flagged)
 *   - Prior night context for the closing narrative
 *   - Commitment fulfillment checking
 */

import { getServiceClient } from '@/lib/supabase/service';
let signalsTableMissing = false;
let missingTableWarned = false;

function isMissingSignalsTableError(error: any): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ');
  return error.code === 'PGRST205' && text.includes('attestation_signals');
}

function shouldSilenceSignalsError(scope: string, error: any): boolean {
  if (!isMissingSignalsTableError(error)) return false;
  signalsTableMissing = true;
  if (!missingTableWarned) {
    console.warn(`[signal-outcomes] ${scope}: attestation_signals table is missing; returning empty fallback until migrations are applied.`);
    missingTableWarned = true;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalRecord {
  id: string;
  attestation_id: string;
  venue_id: string;
  business_date: string;
  signal_type: string;
  extracted_text: string;
  source_field: string;
  confidence: number;
  entity_name: string | null;
  entity_type: string | null;
  mention_sentiment: string | null;
  mention_context: string | null;
  commitment_text: string | null;
  commitment_target_date: string | null;
  commitment_status: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  follow_up_date: string | null;
  follow_up_status: string | null;
  last_followed_up_at: string | null;
  last_follow_up_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  outcome_notes: string | null;
  extracted_at: string;
}

export interface EmployeeMentionSummary {
  entity_name: string;
  entity_type: string | null;
  total_mentions: number;
  positive_count: number;
  negative_count: number;
  actionable_count: number;
  last_mention_date: string;
  recent_contexts: string[]; // Last 3 mention_context values
}

export interface OpenCommitment {
  id: string;
  business_date: string;
  commitment_text: string;
  entity_name: string | null;
  commitment_target_date: string | null;
  commitment_status: string;
  source_field: string;
  days_open: number;
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  follow_up_date: string | null;
  follow_up_status: string | null;
  last_followed_up_at: string | null;
  last_follow_up_note: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PriorNightContext {
  commitments: OpenCommitment[];
  recurring_employees: EmployeeMentionSummary[];
  recent_issues: SignalRecord[];
}

// ---------------------------------------------------------------------------
// Open commitments — what did managers promise but not yet follow through on?
// ---------------------------------------------------------------------------

export async function getOpenCommitments(
  venueId: string,
  options?: { limit?: number; olderThan?: string },
): Promise<OpenCommitment[]> {
  if (signalsTableMissing) return [];
  const supabase = getServiceClient();
  const limit = options?.limit ?? 20;

  let query = (supabase as any)
    .from('attestation_signals')
    .select('id, business_date, commitment_text, entity_name, commitment_target_date, commitment_status, source_field, extracted_at, assigned_to_user_id, assigned_to_name, follow_up_date, follow_up_status, last_followed_up_at, last_follow_up_note, resolved_at, resolved_by')
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .in('commitment_status', ['open', 'due'])
    .order('business_date', { ascending: false })
    .limit(limit);

  if (options?.olderThan) {
    query = query.lt('business_date', options.olderThan);
  }

  const { data, error } = await query;

  if (error) {
    if (shouldSilenceSignalsError('getOpenCommitments', error)) return [];
    console.error('[signal-outcomes] getOpenCommitments error:', error);
    return [];
  }

  const today = new Date();
  return (data || []).map((row: any) => ({
    ...row,
    days_open: Math.floor(
      (today.getTime() - new Date(row.business_date).getTime()) / (1000 * 60 * 60 * 24),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Employee mention history — who keeps getting flagged?
// ---------------------------------------------------------------------------

export async function getEmployeeMentionHistory(
  venueId: string,
  options?: { days?: number; minMentions?: number },
): Promise<EmployeeMentionSummary[]> {
  if (signalsTableMissing) return [];
  const supabase = getServiceClient();
  const days = options?.days ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('entity_name, entity_type, mention_sentiment, mention_context, business_date')
    .eq('venue_id', venueId)
    .in('signal_type', ['employee_mention', 'guest_review_mention'])
    .gte('business_date', cutoff)
    .not('entity_name', 'is', null)
    .order('business_date', { ascending: false });

  if (error) {
    if (shouldSilenceSignalsError('getEmployeeMentionHistory', error)) return [];
    console.error('[signal-outcomes] getEmployeeMentionHistory error:', error);
    return [];
  }

  // Aggregate by employee
  const byEmployee = new Map<string, {
    entity_type: string | null;
    mentions: Array<{ sentiment: string | null; context: string | null; date: string }>;
  }>();

  for (const row of data || []) {
    const name = (row.entity_name as string).toLowerCase().trim();
    if (!byEmployee.has(name)) {
      byEmployee.set(name, { entity_type: row.entity_type, mentions: [] });
    }
    byEmployee.get(name)!.mentions.push({
      sentiment: row.mention_sentiment,
      context: row.mention_context,
      date: row.business_date,
    });
  }

  const minMentions = options?.minMentions ?? 1;
  const results: EmployeeMentionSummary[] = [];

  for (const [name, data] of byEmployee) {
    if (data.mentions.length < minMentions) continue;

    results.push({
      entity_name: name,
      entity_type: data.entity_type,
      total_mentions: data.mentions.length,
      positive_count: data.mentions.filter(m => m.sentiment === 'positive').length,
      negative_count: data.mentions.filter(m => m.sentiment === 'negative').length,
      actionable_count: data.mentions.filter(m => m.sentiment === 'actionable').length,
      last_mention_date: data.mentions[0].date,
      recent_contexts: data.mentions
        .slice(0, 3)
        .map(m => m.context)
        .filter((c): c is string => c != null),
    });
  }

  // Sort: most mentioned first, then by last mention date
  results.sort((a, b) => b.total_mentions - a.total_mentions);

  return results;
}

// ---------------------------------------------------------------------------
// Recent operational issues — what broke recently?
// ---------------------------------------------------------------------------

export async function getRecentIssues(
  venueId: string,
  options?: { days?: number; limit?: number },
): Promise<SignalRecord[]> {
  if (signalsTableMissing) return [];
  const supabase = getServiceClient();
  const days = options?.days ?? 14;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('*')
    .eq('venue_id', venueId)
    .in('signal_type', ['operational_issue', 'staffing_signal'])
    .gte('business_date', cutoff)
    .order('business_date', { ascending: false })
    .limit(options?.limit ?? 10);

  if (error) {
    if (shouldSilenceSignalsError('getRecentIssues', error)) return [];
    console.error('[signal-outcomes] getRecentIssues error:', error);
    return [];
  }

  return data || [];
}

// ---------------------------------------------------------------------------
// Get all signals for a specific attestation
// ---------------------------------------------------------------------------

export async function getSignalsForAttestation(
  attestationId: string,
): Promise<SignalRecord[]> {
  if (signalsTableMissing) return [];
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('*')
    .eq('attestation_id', attestationId)
    .order('signal_type')
    .order('confidence', { ascending: false });

  if (error) {
    if (shouldSilenceSignalsError('getSignalsForAttestation', error)) return [];
    console.error('[signal-outcomes] getSignalsForAttestation error:', error);
    return [];
  }

  return data || [];
}

// ---------------------------------------------------------------------------
// Build prior night context — the accountability payload for tonight's attestation
// ---------------------------------------------------------------------------

export async function buildPriorNightContext(
  venueId: string,
  businessDate: string,
): Promise<PriorNightContext> {
  const [commitments, recurring, issues] = await Promise.all([
    getOpenCommitments(venueId, { limit: 10, olderThan: businessDate }),
    getEmployeeMentionHistory(venueId, { days: 14, minMentions: 2 }),
    getRecentIssues(venueId, { days: 7, limit: 5 }),
  ]);

  return {
    commitments,
    recurring_employees: recurring,
    recent_issues: issues,
  };
}

// ---------------------------------------------------------------------------
// Update commitment statuses — mark overdue commitments
// ---------------------------------------------------------------------------

export async function markOverdueCommitments(
  venueId: string,
): Promise<number> {
  if (signalsTableMissing) return 0;
  const supabase = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  // Mark 'open' commitments past their target date as 'due'
  const { data: dueSoon, error: dueSoonError } = await (supabase as any)
    .from('attestation_signals')
    .update({ commitment_status: 'due', commitment_checked_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .eq('commitment_status', 'open')
    .not('commitment_target_date', 'is', null)
    .lte('commitment_target_date', today)
    .select('id');
  if (dueSoonError) {
    if (shouldSilenceSignalsError('markOverdueCommitments', dueSoonError)) return 0;
    console.error('[signal-outcomes] markOverdueCommitments dueSoon error:', dueSoonError);
    return 0;
  }

  // Mark 'due' commitments older than 7 days as 'unfulfilled' (no evidence of follow-through)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: unfulfilled, error: unfulfilledError } = await (supabase as any)
    .from('attestation_signals')
    .update({ commitment_status: 'unfulfilled', commitment_checked_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .eq('commitment_status', 'due')
    .lte('business_date', weekAgo)
    .select('id');
  if (unfulfilledError) {
    if (shouldSilenceSignalsError('markOverdueCommitments', unfulfilledError)) return 0;
    console.error('[signal-outcomes] markOverdueCommitments unfulfilled error:', unfulfilledError);
    return 0;
  }

  // Also mark open commitments without a target date that are > 7 days old
  const { data: staleOpen, error: staleOpenError } = await (supabase as any)
    .from('attestation_signals')
    .update({ commitment_status: 'due', commitment_checked_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .eq('commitment_status', 'open')
    .is('commitment_target_date', null)
    .lte('business_date', weekAgo)
    .select('id');
  if (staleOpenError) {
    if (shouldSilenceSignalsError('markOverdueCommitments', staleOpenError)) return 0;
    console.error('[signal-outcomes] markOverdueCommitments staleOpen error:', staleOpenError);
    return 0;
  }

  const total = (dueSoon?.length ?? 0) + (unfulfilled?.length ?? 0) + (staleOpen?.length ?? 0);
  if (total > 0) {
    console.log(`[signal-outcomes] Updated ${total} commitment statuses for venue ${venueId}`);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Resolve a commitment — mark as fulfilled with outcome linkage
// ---------------------------------------------------------------------------

export async function resolveCommitment(
  signalId: string,
  outcomeAttestationId: string,
  outcomeNotes: string,
): Promise<boolean> {
  if (signalsTableMissing) return false;
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('attestation_signals')
    .update({
      commitment_status: 'fulfilled',
      outcome_attestation_id: outcomeAttestationId,
      outcome_notes: outcomeNotes,
      outcome_linked_at: new Date().toISOString(),
    })
    .eq('id', signalId);

  if (error) {
    if (shouldSilenceSignalsError('resolveCommitment', error)) return false;
    console.error('[signal-outcomes] resolveCommitment error:', error);
    return false;
  }
  return true;
}

export async function assignCommitment(
  signalId: string,
  assignment: {
    assigned_to_user_id: string;
    assigned_to_name: string;
    follow_up_date?: string | null;
  },
): Promise<boolean> {
  if (signalsTableMissing) return false;
  const supabase = getServiceClient();

  const payload: Record<string, any> = {
    assigned_to_user_id: assignment.assigned_to_user_id,
    assigned_to_name: assignment.assigned_to_name,
  };
  if (assignment.follow_up_date !== undefined) {
    payload.follow_up_date = assignment.follow_up_date;
  }

  const { error } = await (supabase as any)
    .from('attestation_signals')
    .update(payload)
    .eq('id', signalId)
    .eq('signal_type', 'action_commitment');

  if (error) {
    if (shouldSilenceSignalsError('assignCommitment', error)) return false;
    console.error('[signal-outcomes] assignCommitment error:', error);
    return false;
  }
  return true;
}

export async function updateCommitmentFollowUp(
  signalId: string,
  updates: {
    follow_up_status?: 'open' | 'due' | 'in_progress' | 'resolved' | 'escalated';
    follow_up_date?: string | null;
    last_follow_up_note?: string | null;
    last_followed_up_at?: string | null;
  },
): Promise<boolean> {
  if (signalsTableMissing) return false;
  const supabase = getServiceClient();

  const payload: Record<string, any> = {};
  if (updates.follow_up_status !== undefined) payload.follow_up_status = updates.follow_up_status;
  if (updates.follow_up_date !== undefined) payload.follow_up_date = updates.follow_up_date;
  if (updates.last_follow_up_note !== undefined) payload.last_follow_up_note = updates.last_follow_up_note;
  if (updates.last_followed_up_at !== undefined) payload.last_followed_up_at = updates.last_followed_up_at;

  const { error } = await (supabase as any)
    .from('attestation_signals')
    .update(payload)
    .eq('id', signalId)
    .eq('signal_type', 'action_commitment');

  if (error) {
    if (shouldSilenceSignalsError('updateCommitmentFollowUp', error)) return false;
    console.error('[signal-outcomes] updateCommitmentFollowUp error:', error);
    return false;
  }
  return true;
}

export async function resolveCommitmentAction(
  signalId: string,
  resolvedBy: string,
  resolutionNote?: string | null,
): Promise<boolean> {
  if (signalsTableMissing) return false;
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    commitment_status: 'fulfilled',
    follow_up_status: 'resolved',
    resolved_at: now,
    resolved_by: resolvedBy,
    last_followed_up_at: now,
  };
  if (resolutionNote !== undefined) {
    payload.last_follow_up_note = resolutionNote;
    payload.outcome_notes = resolutionNote;
  }

  const { error } = await (supabase as any)
    .from('attestation_signals')
    .update(payload)
    .eq('id', signalId)
    .eq('signal_type', 'action_commitment');

  if (error) {
    if (shouldSilenceSignalsError('resolveCommitmentAction', error)) return false;
    console.error('[signal-outcomes] resolveCommitmentAction error:', error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Org-level open commitments — aggregated across all venues for the home page
// ---------------------------------------------------------------------------

export interface OrgOpenCommitment extends OpenCommitment {
  venue_name: string;
  manager_name: string | null;
}

export async function getOrgOpenCommitments(
  orgId: string,
  options?: { limit?: number },
): Promise<OrgOpenCommitment[]> {
  if (signalsTableMissing) return [];
  const supabase = getServiceClient();
  const limit = options?.limit ?? 15;

  // Get all venue IDs + names for this org
  const { data: venues } = await (supabase as any)
    .from('venues')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  if (!venues || venues.length === 0) return [];

  const venueIds = venues.map((v: any) => v.id);
  const venueNameMap = new Map(venues.map((v: any) => [v.id, v.name]));

  // Query open/due commitments across all org venues
  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('id, business_date, commitment_text, entity_name, commitment_target_date, commitment_status, source_field, venue_id, submitted_by, assigned_to_user_id, assigned_to_name, follow_up_date, follow_up_status, last_followed_up_at, last_follow_up_note, resolved_at, resolved_by')
    .in('venue_id', venueIds)
    .eq('signal_type', 'action_commitment')
    .in('commitment_status', ['open', 'due'])
    .order('business_date', { ascending: false })
    .limit(limit);

  if (error) {
    if (shouldSilenceSignalsError('getOrgOpenCommitments', error)) return [];
    console.error('[signal-outcomes] getOrgOpenCommitments error:', error);
    return [];
  }

  // Batch-fetch manager names
  const managerIds = [...new Set((data || []).map((r: any) => r.submitted_by).filter(Boolean))];
  const managerNameMap = new Map<string, string | null>();
  if (managerIds.length > 0) {
    const { data: profiles } = await (supabase as any)
      .from('user_profiles')
      .select('id, full_name')
      .in('id', managerIds);
    for (const p of profiles || []) {
      managerNameMap.set(p.id, p.full_name);
    }
  }

  const today = new Date();
  return (data || []).map((row: any) => ({
    id: row.id,
    business_date: row.business_date,
    commitment_text: row.commitment_text,
    entity_name: row.entity_name,
    commitment_target_date: row.commitment_target_date,
    commitment_status: row.commitment_status,
    source_field: row.source_field,
    days_open: Math.floor(
      (today.getTime() - new Date(row.business_date).getTime()) / (1000 * 60 * 60 * 24),
    ),
    assigned_to_user_id: row.assigned_to_user_id ?? null,
    assigned_to_name: row.assigned_to_name ?? null,
    follow_up_date: row.follow_up_date ?? null,
    follow_up_status: row.follow_up_status ?? row.commitment_status,
    last_followed_up_at: row.last_followed_up_at ?? null,
    last_follow_up_note: row.last_follow_up_note ?? null,
    resolved_at: row.resolved_at ?? null,
    resolved_by: row.resolved_by ?? null,
    venue_name: venueNameMap.get(row.venue_id) || 'Unknown',
    manager_name: managerNameMap.get(row.submitted_by) || null,
  }));
}
