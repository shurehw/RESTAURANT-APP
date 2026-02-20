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
  const supabase = getServiceClient();
  const limit = options?.limit ?? 20;

  let query = (supabase as any)
    .from('attestation_signals')
    .select('id, business_date, commitment_text, entity_name, commitment_target_date, commitment_status, source_field, extracted_at')
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
  const supabase = getServiceClient();
  const days = options?.days ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('entity_name, entity_type, mention_sentiment, mention_context, business_date')
    .eq('venue_id', venueId)
    .eq('signal_type', 'employee_mention')
    .gte('business_date', cutoff)
    .not('entity_name', 'is', null)
    .order('business_date', { ascending: false });

  if (error) {
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
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('attestation_signals')
    .select('*')
    .eq('attestation_id', attestationId)
    .order('signal_type')
    .order('confidence', { ascending: false });

  if (error) {
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
  const supabase = getServiceClient();
  const today = new Date().toISOString().split('T')[0];

  // Mark 'open' commitments past their target date as 'due'
  const { data: dueSoon } = await (supabase as any)
    .from('attestation_signals')
    .update({ commitment_status: 'due', commitment_checked_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .eq('commitment_status', 'open')
    .not('commitment_target_date', 'is', null)
    .lte('commitment_target_date', today)
    .select('id');

  // Mark 'due' commitments older than 7 days as 'unfulfilled' (no evidence of follow-through)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { data: unfulfilled } = await (supabase as any)
    .from('attestation_signals')
    .update({ commitment_status: 'unfulfilled', commitment_checked_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .eq('commitment_status', 'due')
    .lte('business_date', weekAgo)
    .select('id');

  // Also mark open commitments without a target date that are > 7 days old
  const { data: staleOpen } = await (supabase as any)
    .from('attestation_signals')
    .update({ commitment_status: 'due', commitment_checked_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('signal_type', 'action_commitment')
    .eq('commitment_status', 'open')
    .is('commitment_target_date', null)
    .lte('business_date', weekAgo)
    .select('id');

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
    console.error('[signal-outcomes] resolveCommitment error:', error);
    return false;
  }
  return true;
}
