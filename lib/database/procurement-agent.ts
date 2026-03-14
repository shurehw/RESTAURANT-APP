/**
 * Procurement Agent Database Layer
 *
 * Data access for vendor entities, item classifications, agent runs,
 * approval tiers, and dispatch logs. Follows procurement-settings.ts pattern.
 */

import { getServiceClient } from '@/lib/supabase/service';
import type { ApprovalTier, EntityCode } from '@/lib/ai/procurement-agent-policy';

// ── Types ──────────────────────────────────────────────────────

export interface VendorEntity {
  id: string;
  org_id: string;
  entity_code: string;
  entity_name: string;
  vendor_id: string | null;
  routing_categories: string[];
  is_active: boolean;
}

export interface ItemEntityClassification {
  id: string;
  org_id: string;
  item_id: string;
  entity_code: string;
  confidence: number | null;
  classification_source: 'ai' | 'manual' | 'mercantile_sync';
  classification_reason: string | null;
}

export interface AgentRunParams {
  venue_id: string;
  org_id: string;
  triggered_by: 'cron' | 'manual' | 'signal';
  signal_type?: string;
}

export interface AgentRunResult {
  items_evaluated: number;
  items_classified: number;
  pos_generated: number;
  pos_auto_executed: number;
  pos_pending_approval: number;
  total_estimated_cost: number;
  agent_reasoning: Record<string, unknown>;
  anomalies_detected: unknown[];
  status?: 'running' | 'completed' | 'failed';
}

export interface ApprovalTierRow {
  id: string;
  org_id: string;
  tier_name: ApprovalTier;
  max_amount: number;
  required_role: string;
  auto_execute: boolean;
  is_active: boolean;
}

export interface DispatchLogEntry {
  purchase_order_id: string;
  org_id: string;
  dispatch_method: 'email' | 'api' | 'webhook' | 'manual';
  dispatched_to?: string;
  response_status?: string;
  response_body?: Record<string, unknown>;
}

// ── Vendor Entities ──────────────────────────────────────────

export async function getVendorEntities(orgId: string): Promise<VendorEntity[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('vendor_entities')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true);

  if (error) {
    console.error('[ProcurementAgent] Error fetching vendor entities:', error.message);
    return [];
  }

  return (data || []) as VendorEntity[];
}

export async function getVendorEntityByCode(
  orgId: string,
  entityCode: string
): Promise<VendorEntity | null> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('vendor_entities')
    .select('*')
    .eq('org_id', orgId)
    .eq('entity_code', entityCode)
    .eq('is_active', true)
    .maybeSingle();

  return data as VendorEntity | null;
}

export async function upsertVendorEntity(params: {
  org_id: string;
  entity_code: string;
  entity_name: string;
  vendor_id?: string;
  routing_categories: string[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('vendor_entities')
    .upsert(
      {
        org_id: params.org_id,
        entity_code: params.entity_code,
        entity_name: params.entity_name,
        vendor_id: params.vendor_id || null,
        routing_categories: params.routing_categories,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,entity_code' }
    )
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

// ── Item Entity Classifications ──────────────────────────────

export async function getItemClassifications(
  orgId: string,
  itemIds?: string[]
): Promise<ItemEntityClassification[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('item_entity_classifications')
    .select('*')
    .eq('org_id', orgId);

  if (itemIds && itemIds.length > 0) {
    query = query.in('item_id', itemIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[ProcurementAgent] Error fetching classifications:', error.message);
    return [];
  }

  return (data || []) as ItemEntityClassification[];
}

export async function getUnclassifiedItems(
  orgId: string,
  venueId?: string
): Promise<Array<{ id: string; name: string; category: string }>> {
  const supabase = getServiceClient();

  // Get items that have no classification yet
  // If venueId specified, only items with par levels at that venue
  let query = (supabase as any)
    .from('items')
    .select('id, name, category')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .not(
      'id',
      'in',
      `(select item_id from item_entity_classifications where org_id = '${orgId}')`
    );

  const { data, error } = await query;

  if (error) {
    // Subquery filter may not work — fallback to manual filter
    const { data: allItems } = await (supabase as any)
      .from('items')
      .select('id, name, category')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    const { data: classified } = await (supabase as any)
      .from('item_entity_classifications')
      .select('item_id')
      .eq('org_id', orgId);

    const classifiedSet = new Set((classified || []).map((c: any) => c.item_id));
    return (allItems || []).filter((item: any) => !classifiedSet.has(item.id));
  }

  return (data || []) as Array<{ id: string; name: string; category: string }>;
}

export async function upsertItemClassifications(
  orgId: string,
  classifications: Array<{
    item_id: string;
    entity_code: EntityCode;
    confidence: number;
    classification_source: 'ai' | 'manual' | 'mercantile_sync';
    classification_reason?: string;
  }>
): Promise<{ success: boolean; count: number; error?: string }> {
  if (classifications.length === 0) return { success: true, count: 0 };

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const rows = classifications.map((c) => ({
    org_id: orgId,
    item_id: c.item_id,
    entity_code: c.entity_code,
    confidence: c.confidence,
    classification_source: c.classification_source,
    classification_reason: c.classification_reason || null,
    updated_at: now,
  }));

  const { error } = await (supabase as any)
    .from('item_entity_classifications')
    .upsert(rows, { onConflict: 'org_id,item_id' });

  if (error) return { success: false, count: 0, error: error.message };
  return { success: true, count: rows.length };
}

// ── Agent Runs ──────────────────────────────────────────────

export async function createAgentRun(params: AgentRunParams): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('procurement_agent_runs')
    .insert({
      venue_id: params.venue_id,
      org_id: params.org_id,
      triggered_by: params.triggered_by,
      signal_type: params.signal_type || null,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create agent run: ${error.message}`);
  return data.id;
}

export async function updateAgentRun(
  runId: string,
  result: AgentRunResult
): Promise<void> {
  const supabase = getServiceClient();
  const status = result.status || 'completed';

  const { error } = await (supabase as any)
    .from('procurement_agent_runs')
    .update({
      items_evaluated: result.items_evaluated,
      items_classified: result.items_classified,
      pos_generated: result.pos_generated,
      pos_auto_executed: result.pos_auto_executed,
      pos_pending_approval: result.pos_pending_approval,
      total_estimated_cost: result.total_estimated_cost,
      agent_reasoning: result.agent_reasoning,
      anomalies_detected: result.anomalies_detected,
      status,
      completed_at: status === 'completed' || status === 'failed'
        ? new Date().toISOString()
        : null,
    })
    .eq('id', runId);

  if (error) {
    console.error('[ProcurementAgent] Error updating agent run:', error.message);
  }
}

export async function getRecentAgentRuns(
  venueId: string,
  limit: number = 10
): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('procurement_agent_runs')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// ── Approval Tiers ──────────────────────────────────────────

export async function getApprovalTiers(orgId: string): Promise<ApprovalTierRow[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('procurement_approval_tiers')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('max_amount', { ascending: true });

  if (error) {
    console.error('[ProcurementAgent] Error fetching approval tiers:', error.message);
    return [];
  }

  return (data || []) as ApprovalTierRow[];
}

export async function seedDefaultApprovalTiers(orgId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any).rpc('seed_default_approval_tiers', {
    p_org_id: orgId,
  });

  if (error) {
    console.error('[ProcurementAgent] Error seeding approval tiers:', error.message);
  }
}

// ── Dispatch Log ──────────────────────────────────────────

export async function recordDispatch(entry: DispatchLogEntry): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('po_dispatch_log')
    .insert({
      purchase_order_id: entry.purchase_order_id,
      org_id: entry.org_id,
      dispatch_method: entry.dispatch_method,
      dispatched_to: entry.dispatched_to || null,
      response_status: entry.response_status || 'sent',
      response_body: entry.response_body || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to record dispatch: ${error.message}`);
  return data.id;
}

// ── PO Agent Metadata Update ──────────────────────────────

export async function updatePOAgentMetadata(
  poId: string,
  metadata: {
    agent_run_id?: string;
    approval_tier?: ApprovalTier;
    entity_code?: string;
    is_bundled?: boolean;
    bundle_group_id?: string;
  }
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('purchase_orders')
    .update(metadata)
    .eq('id', poId);

  if (error) {
    console.error('[ProcurementAgent] Error updating PO metadata:', error.message);
  }
}

/**
 * Get venues with procurement agent enabled.
 */
export async function getAgentEnabledVenues(): Promise<
  Array<{ venue_id: string; org_id: string; venue_name: string }>
> {
  const supabase = getServiceClient();

  // Get orgs with agent_enabled, then their venues
  const { data: settings } = await (supabase as any)
    .from('procurement_settings')
    .select('org_id')
    .eq('is_active', true)
    .is('effective_to', null)
    .eq('agent_enabled', true);

  if (!settings || settings.length === 0) return [];

  const orgIds = settings.map((s: any) => s.org_id);

  const { data: venues } = await (supabase as any)
    .from('venues')
    .select('id, organization_id, name')
    .in('organization_id', orgIds)
    .eq('is_active', true);

  return (venues || []).map((v: any) => ({
    venue_id: v.id,
    org_id: v.organization_id,
    venue_name: v.name,
  }));
}
