/**
 * Signal Analytics — manager-level signal analysis
 *
 * Answers: Who is writing what? Which managers follow through?
 * Who flags the same employees repeatedly? What patterns emerge per manager?
 */

import { getServiceClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagerSignalProfile {
  manager_id: string;
  manager_name: string | null;
  manager_email: string;

  // Volume
  total_attestations: number;
  total_signals: number;
  avg_signals_per_attestation: number;

  // Signal breakdown
  employee_mentions: number;
  action_commitments: number;
  menu_items: number;
  operational_issues: number;
  guest_insights: number;
  staffing_signals: number;

  // Accountability
  commitments_made: number;
  commitments_fulfilled: number;
  commitments_unfulfilled: number;
  commitments_open: number;
  follow_through_rate: number; // fulfilled / (fulfilled + unfulfilled), 0-1

  // Employee mention patterns
  unique_employees_mentioned: number;
  most_mentioned_employees: Array<{
    name: string;
    count: number;
    positive: number;
    negative: number;
    actionable: number;
  }>;

  // Sentiment distribution
  positive_mentions: number;
  negative_mentions: number;
  actionable_mentions: number;
  neutral_mentions: number;

  // Ownership (averages across all scored attestations)
  avg_ownership: {
    narrative_depth: number;
    ownership: number;
    variance_awareness: number;
    signal_density: number;
    command_tone: number;
    energy_alignment: number;
    overall_command_score: number;
  } | null;
  ownership_trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  // Avoidance pattern detection
  avoidance_rate: number;   // % of attestations with avoidance_flag = true
  blame_shift_rate: number; // % with blame_shift_flag = true
  corrective_action_rate: number; // % where they took real-time corrective action
  variance_awareness_rate: number; // % that reference benchmarks

  // Date range
  first_attestation: string;
  last_attestation: string;
}

export interface ManagerSignalTimeline {
  manager_id: string;
  business_date: string;
  signal_count: number;
  employee_mentions: number;
  action_commitments: number;
  operational_issues: number;
  signals: Array<{
    signal_type: string;
    entity_name: string | null;
    extracted_text: string;
    mention_sentiment: string | null;
    commitment_text: string | null;
    commitment_status: string | null;
    source_field: string;
  }>;
}

export interface SignalDetail {
  id: string;
  attestation_id: string;
  venue_id: string;
  business_date: string;
  submitted_by: string | null;
  manager_name: string | null;
  manager_email: string | null;
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
  extracted_at: string;
}

// ---------------------------------------------------------------------------
// Get manager signal profile — aggregated view of a manager's patterns
// ---------------------------------------------------------------------------

export async function getManagerSignalProfile(
  managerId: string,
  options?: { days?: number; venueId?: string },
): Promise<ManagerSignalProfile | null> {
  const supabase = getServiceClient();
  const days = options?.days ?? 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get manager info
  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('full_name, users!inner(email)')
    .eq('id', managerId)
    .single();

  // Get all signals by this manager
  let query = (supabase as any)
    .from('attestation_signals')
    .select('*')
    .eq('submitted_by', managerId)
    .gte('business_date', cutoff)
    .order('business_date', { ascending: false });

  if (options?.venueId) {
    query = query.eq('venue_id', options.venueId);
  }

  const { data: signals, error } = await query;

  if (error) {
    console.error('[signal-analytics] getManagerSignalProfile error:', error);
    return null;
  }

  if (!signals || signals.length === 0) {
    return null;
  }

  // Count unique attestations
  const attestationIds = new Set(signals.map((s: any) => s.attestation_id));

  // Count by type
  const byType: Record<string, number> = {};
  for (const s of signals) {
    byType[s.signal_type] = (byType[s.signal_type] || 0) + 1;
  }

  // Commitment tracking
  const commitments = signals.filter((s: any) => s.signal_type === 'action_commitment');
  const fulfilled = commitments.filter((c: any) => c.commitment_status === 'fulfilled').length;
  const unfulfilled = commitments.filter((c: any) => c.commitment_status === 'unfulfilled').length;
  const open = commitments.filter((c: any) => ['open', 'due'].includes(c.commitment_status)).length;
  const closedCommitments = fulfilled + unfulfilled;

  // Employee mention analysis
  const employeeMentions = signals.filter((s: any) => s.signal_type === 'employee_mention');
  const byEmployee = new Map<string, { count: number; positive: number; negative: number; actionable: number }>();
  for (const m of employeeMentions) {
    const name = (m.entity_name || 'unknown').toLowerCase().trim();
    if (!byEmployee.has(name)) {
      byEmployee.set(name, { count: 0, positive: 0, negative: 0, actionable: 0 });
    }
    const emp = byEmployee.get(name)!;
    emp.count++;
    if (m.mention_sentiment === 'positive') emp.positive++;
    if (m.mention_sentiment === 'negative') emp.negative++;
    if (m.mention_sentiment === 'actionable') emp.actionable++;
  }

  const mostMentioned = [...byEmployee.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Sentiment totals
  const sentiments = employeeMentions.reduce(
    (acc: Record<string, number>, m: any) => {
      acc[m.mention_sentiment || 'neutral'] = (acc[m.mention_sentiment || 'neutral'] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  // Date range
  const dates = signals.map((s: any) => s.business_date).sort();

  // Ownership analysis — fetch ownership_scores from attestations
  let avgOwnership: ManagerSignalProfile['avg_ownership'] = null;
  let ownershipTrend: ManagerSignalProfile['ownership_trend'] = 'insufficient_data';
  let avoidanceRate = 0;
  let blameShiftRate = 0;
  let correctiveActionRate = 0;
  let varianceAwarenessRate = 0;

  {
    let ownershipQuery = (supabase as any)
      .from('nightly_attestations')
      .select('business_date, ownership_scores')
      .eq('submitted_by', managerId)
      .gte('business_date', cutoff)
      .not('ownership_scores', 'is', null)
      .order('business_date', { ascending: true });

    if (options?.venueId) {
      ownershipQuery = ownershipQuery.eq('venue_id', options.venueId);
    }

    const { data: ownershipRows } = await ownershipQuery;
    const scored = (ownershipRows || []).filter((r: any) => r.ownership_scores?.overall_command_score != null);

    if (scored.length > 0) {
      // Compute averages across all scored dimensions
      const dims = ['narrative_depth', 'ownership', 'variance_awareness', 'signal_density', 'command_tone', 'energy_alignment', 'overall_command_score'] as const;
      const sums: Record<string, number> = {};
      for (const d of dims) sums[d] = 0;
      for (const row of scored) {
        for (const d of dims) sums[d] += row.ownership_scores[d] || 0;
      }
      avgOwnership = {
        narrative_depth: +(sums.narrative_depth / scored.length).toFixed(1),
        ownership: +(sums.ownership / scored.length).toFixed(1),
        variance_awareness: +(sums.variance_awareness / scored.length).toFixed(1),
        signal_density: +(sums.signal_density / scored.length).toFixed(1),
        command_tone: +(sums.command_tone / scored.length).toFixed(1),
        energy_alignment: +(sums.energy_alignment / scored.length).toFixed(1),
        overall_command_score: +(sums.overall_command_score / scored.length).toFixed(1),
      };

      // Flag rates
      avoidanceRate = scored.filter((r: any) => r.ownership_scores.avoidance_flag).length / scored.length;
      blameShiftRate = scored.filter((r: any) => r.ownership_scores.blame_shift_flag).length / scored.length;
      correctiveActionRate = scored.filter((r: any) => r.ownership_scores.corrective_action_flag).length / scored.length;
      varianceAwarenessRate = scored.filter((r: any) => r.ownership_scores.variance_reference_flag).length / scored.length;

      // Trend: compare first half vs second half of command scores
      if (scored.length >= 4) {
        const mid = Math.floor(scored.length / 2);
        const firstHalf = scored.slice(0, mid);
        const secondHalf = scored.slice(mid);
        const avgFirst = firstHalf.reduce((s: number, r: any) => s + (r.ownership_scores.overall_command_score || 0), 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((s: number, r: any) => s + (r.ownership_scores.overall_command_score || 0), 0) / secondHalf.length;
        const diff = avgSecond - avgFirst;
        ownershipTrend = diff > 0.5 ? 'improving' : diff < -0.5 ? 'declining' : 'stable';
      }
    }
  }

  return {
    manager_id: managerId,
    manager_name: profile?.full_name || null,
    manager_email: profile?.users?.email || '',
    total_attestations: attestationIds.size,
    total_signals: signals.length,
    avg_signals_per_attestation: signals.length / attestationIds.size,
    employee_mentions: byType['employee_mention'] || 0,
    action_commitments: byType['action_commitment'] || 0,
    menu_items: byType['menu_item'] || 0,
    operational_issues: byType['operational_issue'] || 0,
    guest_insights: byType['guest_insight'] || 0,
    staffing_signals: byType['staffing_signal'] || 0,
    commitments_made: commitments.length,
    commitments_fulfilled: fulfilled,
    commitments_unfulfilled: unfulfilled,
    commitments_open: open,
    follow_through_rate: closedCommitments > 0 ? fulfilled / closedCommitments : 0,
    unique_employees_mentioned: byEmployee.size,
    most_mentioned_employees: mostMentioned,
    positive_mentions: sentiments['positive'] || 0,
    negative_mentions: sentiments['negative'] || 0,
    actionable_mentions: sentiments['actionable'] || 0,
    neutral_mentions: sentiments['neutral'] || 0,
    avg_ownership: avgOwnership,
    ownership_trend: ownershipTrend,
    avoidance_rate: +avoidanceRate.toFixed(2),
    blame_shift_rate: +blameShiftRate.toFixed(2),
    corrective_action_rate: +correctiveActionRate.toFixed(2),
    variance_awareness_rate: +varianceAwarenessRate.toFixed(2),
    first_attestation: dates[0],
    last_attestation: dates[dates.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Get signal timeline — day-by-day breakdown for a manager
// ---------------------------------------------------------------------------

export async function getManagerSignalTimeline(
  managerId: string,
  options?: { days?: number; venueId?: string },
): Promise<ManagerSignalTimeline[]> {
  const supabase = getServiceClient();
  const days = options?.days ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let query = (supabase as any)
    .from('attestation_signals')
    .select('business_date, signal_type, entity_name, extracted_text, mention_sentiment, commitment_text, commitment_status, source_field')
    .eq('submitted_by', managerId)
    .gte('business_date', cutoff)
    .order('business_date', { ascending: false });

  if (options?.venueId) {
    query = query.eq('venue_id', options.venueId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[signal-analytics] getManagerSignalTimeline error:', error);
    return [];
  }

  // Group by date
  const byDate = new Map<string, ManagerSignalTimeline>();
  for (const row of data || []) {
    if (!byDate.has(row.business_date)) {
      byDate.set(row.business_date, {
        manager_id: managerId,
        business_date: row.business_date,
        signal_count: 0,
        employee_mentions: 0,
        action_commitments: 0,
        operational_issues: 0,
        signals: [],
      });
    }
    const day = byDate.get(row.business_date)!;
    day.signal_count++;
    if (row.signal_type === 'employee_mention') day.employee_mentions++;
    if (row.signal_type === 'action_commitment') day.action_commitments++;
    if (row.signal_type === 'operational_issue') day.operational_issues++;
    day.signals.push(row);
  }

  return [...byDate.values()];
}

// ---------------------------------------------------------------------------
// Get all signals with manager info — filterable feed
// ---------------------------------------------------------------------------

export async function getSignalFeed(
  options: {
    venueId?: string;
    managerId?: string;
    signalType?: string;
    days?: number;
    limit?: number;
    entityName?: string;
  },
): Promise<SignalDetail[]> {
  const supabase = getServiceClient();
  const days = options.days ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Build query — join to user_profiles for manager name
  let query = (supabase as any)
    .from('attestation_signals')
    .select('*')
    .gte('business_date', cutoff)
    .order('business_date', { ascending: false })
    .order('extracted_at', { ascending: false })
    .limit(options.limit ?? 100);

  if (options.venueId) query = query.eq('venue_id', options.venueId);
  if (options.managerId) query = query.eq('submitted_by', options.managerId);
  if (options.signalType) query = query.eq('signal_type', options.signalType);
  if (options.entityName) query = query.ilike('entity_name', `%${options.entityName}%`);

  const { data: signals, error } = await query;

  if (error) {
    console.error('[signal-analytics] getSignalFeed error:', error);
    return [];
  }

  if (!signals || signals.length === 0) return [];

  // Batch-fetch manager names for all unique submitted_by IDs
  const managerIds = [...new Set(signals.map((s: any) => s.submitted_by).filter(Boolean))];
  const managerMap = new Map<string, { name: string | null; email: string }>();

  if (managerIds.length > 0) {
    const { data: profiles } = await (supabase as any)
      .from('user_profiles')
      .select('id, full_name')
      .in('id', managerIds);

    const { data: users } = await (supabase as any)
      .from('users')
      .select('id, email')
      .in('id', managerIds);

    for (const p of profiles || []) {
      const user = (users || []).find((u: any) => u.id === p.id);
      managerMap.set(p.id, { name: p.full_name, email: user?.email || '' });
    }
  }

  return signals.map((s: any) => {
    const manager = managerMap.get(s.submitted_by) || { name: null, email: null };
    return {
      ...s,
      manager_name: manager.name,
      manager_email: manager.email,
    };
  });
}

// ---------------------------------------------------------------------------
// Manager comparison — compare signal patterns across managers for a venue
// ---------------------------------------------------------------------------

export async function getManagerComparison(
  venueId: string,
  options?: { days?: number },
): Promise<Array<{
  manager_id: string;
  manager_name: string | null;
  total_attestations: number;
  total_signals: number;
  avg_signals_per_night: number;
  commitments_made: number;
  follow_through_rate: number;
  unique_employees_mentioned: number;
  negative_mention_rate: number;
  top_concern: string | null;
  avg_command_score: number | null;
  avoidance_rate: number;
  corrective_action_rate: number;
}>> {
  const supabase = getServiceClient();
  const days = options?.days ?? 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Fetch signals and attestation ownership scores in parallel
  const [signalsResult, attestationsResult] = await Promise.all([
    (supabase as any)
      .from('attestation_signals')
      .select('*')
      .eq('venue_id', venueId)
      .gte('business_date', cutoff)
      .not('submitted_by', 'is', null),
    (supabase as any)
      .from('nightly_attestations')
      .select('id, submitted_by, ownership_scores')
      .eq('venue_id', venueId)
      .gte('business_date', cutoff)
      .not('ownership_scores', 'is', null),
  ]);

  const signals = signalsResult.data;
  const error = signalsResult.error;
  if (error || !signals?.length) return [];

  // Build ownership lookup: manager_id → ownership scores[]
  const ownershipByManager = new Map<string, any[]>();
  for (const att of attestationsResult.data || []) {
    if (!att.submitted_by || !att.ownership_scores) continue;
    if (!ownershipByManager.has(att.submitted_by)) ownershipByManager.set(att.submitted_by, []);
    ownershipByManager.get(att.submitted_by)!.push(att.ownership_scores);
  }

  // Group by manager
  const byManager = new Map<string, any[]>();
  for (const s of signals) {
    if (!byManager.has(s.submitted_by)) byManager.set(s.submitted_by, []);
    byManager.get(s.submitted_by)!.push(s);
  }

  // Fetch manager names
  const managerIds = [...byManager.keys()];
  const { data: profiles } = await (supabase as any)
    .from('user_profiles')
    .select('id, full_name')
    .in('id', managerIds);

  const nameMap = new Map<string, string | null>();
  for (const p of profiles || []) {
    nameMap.set(p.id, p.full_name);
  }

  const results = [];
  for (const [managerId, managerSignals] of byManager) {
    const attestations = new Set(managerSignals.map((s: any) => s.attestation_id));
    const commitments = managerSignals.filter((s: any) => s.signal_type === 'action_commitment');
    const fulfilled = commitments.filter((c: any) => c.commitment_status === 'fulfilled').length;
    const unfulfilled = commitments.filter((c: any) => c.commitment_status === 'unfulfilled').length;
    const closed = fulfilled + unfulfilled;

    const empMentions = managerSignals.filter((s: any) => s.signal_type === 'employee_mention');
    const negativeMentions = empMentions.filter((m: any) => m.mention_sentiment === 'negative');
    const uniqueEmps = new Set(empMentions.map((m: any) => (m.entity_name || '').toLowerCase().trim()));

    // Find most frequently negatively-mentioned employee
    const negByEmployee = new Map<string, number>();
    for (const m of negativeMentions) {
      const name = (m.entity_name || '').toLowerCase().trim();
      negByEmployee.set(name, (negByEmployee.get(name) || 0) + 1);
    }
    let topConcern: string | null = null;
    let topConcernCount = 0;
    for (const [name, count] of negByEmployee) {
      if (count > topConcernCount) { topConcern = name; topConcernCount = count; }
    }

    // Ownership scores for this manager
    const mgrOwnership = ownershipByManager.get(managerId) || [];
    const avgCommand = mgrOwnership.length > 0
      ? +(mgrOwnership.reduce((s: number, o: any) => s + (o.overall_command_score || 0), 0) / mgrOwnership.length).toFixed(1)
      : null;
    const mgrAvoidance = mgrOwnership.length > 0
      ? mgrOwnership.filter((o: any) => o.avoidance_flag).length / mgrOwnership.length
      : 0;
    const mgrCorrective = mgrOwnership.length > 0
      ? mgrOwnership.filter((o: any) => o.corrective_action_flag).length / mgrOwnership.length
      : 0;

    results.push({
      manager_id: managerId,
      manager_name: nameMap.get(managerId) || null,
      total_attestations: attestations.size,
      total_signals: managerSignals.length,
      avg_signals_per_night: managerSignals.length / attestations.size,
      commitments_made: commitments.length,
      follow_through_rate: closed > 0 ? fulfilled / closed : 0,
      unique_employees_mentioned: uniqueEmps.size,
      negative_mention_rate: empMentions.length > 0 ? negativeMentions.length / empMentions.length : 0,
      top_concern: topConcernCount >= 2 ? topConcern : null,
      avg_command_score: avgCommand,
      avoidance_rate: +mgrAvoidance.toFixed(2),
      corrective_action_rate: +mgrCorrective.toFixed(2),
    });
  }

  // Sort by total signals desc
  results.sort((a, b) => b.total_signals - a.total_signals);
  return results;
}
