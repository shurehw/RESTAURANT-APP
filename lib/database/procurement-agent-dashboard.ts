/**
 * Procurement Agent Dashboard — Data Layer
 *
 * Queries that surface agent activity so the team can see the agent
 * is working: runs executed, POs generated, savings captured,
 * followups fired, anomalies flagged.
 *
 * Powers the procurement agent dashboard UI.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ──────────────────────────────────────────────────────

export interface AgentActivitySummary {
  total_runs: number;
  runs_last_24h: number;
  runs_last_7d: number;
  total_pos_generated: number;
  total_pos_auto_executed: number;
  total_pos_dispatched: number;
  total_po_value: number;
  total_anomalies_detected: number;
}

export interface AgentRecentRun {
  run_id: string;
  venue_name: string;
  venue_id: string;
  triggered_by: string;
  signal_type: string | null;
  items_evaluated: number;
  pos_generated: number;
  pos_auto_executed: number;
  anomalies_detected: any;
  started_at: string;
  completed_at: string | null;
  status: string;
  run_po_total: number;
  run_pos_dispatched: number;
  run_pos_received: number;
}

export interface SavingsSummary {
  total_bundle_savings: number;
  total_transfer_savings: number;
  total_savings: number;
  bundle_count: number;
  transfer_count: number;
}

export interface FollowupSummary {
  total_pending: number;
  total_executed: number;
  total_skipped: number;
  confirmation_requests_sent: number;
  escalations_sent: number;
  at_risk_alerts: number;
  missed_deliveries: number;
}

export interface DashboardData {
  activity: AgentActivitySummary;
  recent_runs: AgentRecentRun[];
  savings: SavingsSummary;
  followups: FollowupSummary;
  pending_bundles: number;
  pending_transfers: number;
  unmatched_receipts: number;
  invoice_disputes: number;
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Get full dashboard data for an org.
 */
export async function getAgentDashboard(
  orgId: string,
  venueId?: string
): Promise<DashboardData> {
  const [activity, recentRuns, savings, followups, counts] = await Promise.all([
    getActivitySummary(orgId, venueId),
    getRecentRuns(orgId, venueId),
    getSavingsSummary(orgId, venueId),
    getFollowupSummary(orgId, venueId),
    getPendingCounts(orgId, venueId),
  ]);

  return {
    activity,
    recent_runs: recentRuns,
    savings,
    followups,
    ...counts,
  };
}

async function getActivitySummary(
  orgId: string,
  venueId?: string
): Promise<AgentActivitySummary> {
  const supabase = getServiceClient();
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3600000).toISOString();
  const d7 = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();

  let query = (supabase as any)
    .from('procurement_agent_runs')
    .select('id, items_evaluated, pos_generated, pos_auto_executed, anomalies_detected, started_at, status')
    .eq('org_id', orgId);

  if (venueId) query = query.eq('venue_id', venueId);

  const { data: runs } = await query;
  if (!runs || runs.length === 0) {
    return {
      total_runs: 0,
      runs_last_24h: 0,
      runs_last_7d: 0,
      total_pos_generated: 0,
      total_pos_auto_executed: 0,
      total_pos_dispatched: 0,
      total_po_value: 0,
      total_anomalies_detected: 0,
    };
  }

  const completed = runs.filter((r: any) => r.status === 'completed');
  const last24h = completed.filter((r: any) => r.started_at >= h24);
  const last7d = completed.filter((r: any) => r.started_at >= d7);

  // Get dispatched PO count + total value
  let poQuery = (supabase as any)
    .from('purchase_orders')
    .select('id, total_amount, status')
    .not('agent_run_id', 'is', null);

  // Scope to venue's POs if venue filter is set
  if (venueId) poQuery = poQuery.eq('venue_id', venueId);

  const { data: agentPOs } = await poQuery;
  const dispatched = (agentPOs || []).filter((po: any) => po.status === 'ordered' || po.status === 'received');
  const totalValue = (agentPOs || []).reduce((s: number, po: any) => s + (po.total_amount || 0), 0);

  const totalAnomalies = completed.reduce((s: number, r: any) => {
    const a = r.anomalies_detected;
    return s + (Array.isArray(a) ? a.length : typeof a === 'number' ? a : 0);
  }, 0);

  return {
    total_runs: completed.length,
    runs_last_24h: last24h.length,
    runs_last_7d: last7d.length,
    total_pos_generated: completed.reduce((s: number, r: any) => s + (r.pos_generated || 0), 0),
    total_pos_auto_executed: completed.reduce((s: number, r: any) => s + (r.pos_auto_executed || 0), 0),
    total_pos_dispatched: dispatched.length,
    total_po_value: Math.round(totalValue * 100) / 100,
    total_anomalies_detected: totalAnomalies,
  };
}

async function getRecentRuns(
  orgId: string,
  venueId?: string,
  limit: number = 20
): Promise<AgentRecentRun[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('procurement_agent_runs')
    .select(`
      id, venue_id, triggered_by, signal_type,
      items_evaluated, pos_generated, pos_auto_executed,
      anomalies_detected, started_at, completed_at, status,
      venues(name)
    `)
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (venueId) query = query.eq('venue_id', venueId);

  const { data: runs } = await query;
  if (!runs) return [];

  return runs.map((r: any) => ({
    run_id: r.id,
    venue_name: r.venues?.name || r.venue_id,
    venue_id: r.venue_id,
    triggered_by: r.triggered_by,
    signal_type: r.signal_type,
    items_evaluated: r.items_evaluated || 0,
    pos_generated: r.pos_generated || 0,
    pos_auto_executed: r.pos_auto_executed || 0,
    anomalies_detected: r.anomalies_detected,
    started_at: r.started_at,
    completed_at: r.completed_at,
    status: r.status,
    run_po_total: 0, // filled below if needed
    run_pos_dispatched: 0,
    run_pos_received: 0,
  }));
}

async function getSavingsSummary(orgId: string, venueId?: string): Promise<SavingsSummary> {
  const supabase = getServiceClient();

  let bundlesQuery = (supabase as any)
    .from('po_bundle_groups')
    .select('estimated_savings, status, venue_ids')
    .eq('org_id', orgId)
    .in('status', ['approved', 'ordered', 'delivered']);
  if (venueId) bundlesQuery = bundlesQuery.contains('venue_ids', [venueId]);
  const { data: bundles } = await bundlesQuery;

  let transfersQuery = (supabase as any)
    .from('inventory_transfers')
    .select('quantity, unit_cost, status, from_venue_id, to_venue_id')
    .eq('org_id', orgId)
    .in('status', ['approved', 'in_transit', 'received']);
  if (venueId) {
    transfersQuery = transfersQuery.or(`from_venue_id.eq.${venueId},to_venue_id.eq.${venueId}`);
  }
  const { data: transfers } = await transfersQuery;

  const bundleSavings = (bundles || []).reduce(
    (s: number, b: any) => s + (b.estimated_savings || 0), 0
  );
  const transferSavings = (transfers || []).reduce(
    (s: number, t: any) => s + ((t.quantity || 0) * (t.unit_cost || 0)), 0
  );

  return {
    total_bundle_savings: Math.round(bundleSavings * 100) / 100,
    total_transfer_savings: Math.round(transferSavings * 100) / 100,
    total_savings: Math.round((bundleSavings + transferSavings) * 100) / 100,
    bundle_count: (bundles || []).length,
    transfer_count: (transfers || []).length,
  };
}

async function getFollowupSummary(
  orgId: string,
  venueId?: string
): Promise<FollowupSummary> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('po_followups')
    .select('id, followup_type, status, purchase_order_id')
    .eq('org_id', orgId);

  if (venueId) {
    const { data: venuePOs } = await (supabase as any)
      .from('purchase_orders')
      .select('id')
      .eq('venue_id', venueId);

    const poIds = (venuePOs || []).map((po: any) => po.id);
    if (poIds.length === 0) {
      return {
        total_pending: 0,
        total_executed: 0,
        total_skipped: 0,
        confirmation_requests_sent: 0,
        escalations_sent: 0,
        at_risk_alerts: 0,
        missed_deliveries: 0,
      };
    }
    query = query.in('purchase_order_id', poIds);
  }

  const { data: followups } = await query;
  if (!followups) {
    return {
      total_pending: 0,
      total_executed: 0,
      total_skipped: 0,
      confirmation_requests_sent: 0,
      escalations_sent: 0,
      at_risk_alerts: 0,
      missed_deliveries: 0,
    };
  }

  const executed = followups.filter((f: any) => f.status === 'executed');

  return {
    total_pending: followups.filter((f: any) => f.status === 'pending').length,
    total_executed: executed.length,
    total_skipped: followups.filter((f: any) => f.status === 'skipped').length,
    confirmation_requests_sent: executed.filter(
      (f: any) => f.followup_type === 'confirmation_request'
    ).length,
    escalations_sent: executed.filter(
      (f: any) => f.followup_type === 'confirmation_escalation'
    ).length,
    at_risk_alerts: executed.filter(
      (f: any) => f.followup_type === 'at_risk_alert'
    ).length,
    missed_deliveries: executed.filter(
      (f: any) => f.followup_type === 'missed_delivery'
    ).length,
  };
}

async function getPendingCounts(
  orgId: string,
  venueId?: string
): Promise<{
  pending_bundles: number;
  pending_transfers: number;
  unmatched_receipts: number;
  invoice_disputes: number;
}> {
  const supabase = getServiceClient();
  let venuePOIds: string[] | null = null;
  if (venueId) {
    const { data: venuePOs } = await (supabase as any)
      .from('purchase_orders')
      .select('id')
      .eq('venue_id', venueId);
    venuePOIds = (venuePOs || []).map((po: any) => po.id);
  }

  let bundlesQuery = (supabase as any)
      .from('po_bundle_groups')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'proposed');
  if (venueId) bundlesQuery = bundlesQuery.contains('venue_ids', [venueId]);

  let transfersQuery = (supabase as any)
      .from('inventory_transfers')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'proposed');
  if (venueId) transfersQuery = transfersQuery.or(`from_venue_id.eq.${venueId},to_venue_id.eq.${venueId}`);

  let invoicesQuery = (supabase as any)
      .from('invoice_matches')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('match_status', 'dispute');
  if (venuePOIds) {
    if (venuePOIds.length === 0) {
      invoicesQuery = (supabase as any)
        .from('invoice_matches')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('match_status', 'dispute')
        .in('purchase_order_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      invoicesQuery = invoicesQuery.in('purchase_order_id', venuePOIds);
    }
  }

  let unmatchedQuery = (supabase as any)
    .from('po_receipt_matches')
    .select('id, purchase_order_id', { count: 'exact' })
    .eq('match_status', 'unmatched');
  if (venuePOIds) {
    if (venuePOIds.length === 0) {
      unmatchedQuery = (supabase as any)
        .from('po_receipt_matches')
        .select('id, purchase_order_id', { count: 'exact' })
        .eq('match_status', 'unmatched')
        .in('purchase_order_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      unmatchedQuery = unmatchedQuery.in('purchase_order_id', venuePOIds);
    }
  }

  const [bundles, transfers, invoices, unmatched] = await Promise.all([
    bundlesQuery,
    transfersQuery,
    invoicesQuery,
    unmatchedQuery,
  ]);

  return {
    pending_bundles: bundles.count || 0,
    pending_transfers: transfers.count || 0,
    unmatched_receipts: unmatched.count || 0,
    invoice_disputes: invoices.count || 0,
  };
}
