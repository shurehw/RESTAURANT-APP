/**
 * Menu Agent Database Layer
 *
 * Data access for menu agent settings, runs, recommendations,
 * item surfaces, and performance views.
 * Follows procurement-agent.ts pattern.
 */

import { getServiceClient } from '@/lib/supabase/service';
import { shouldSilenceMissingRelationError } from '@/lib/database/schema-guards';
import type { MenuAgentMode, MenuActionType } from '@/lib/ai/menu-agent-policy';

// ── Types ──────────────────────────────────────────────────────

export interface MenuAgentRunParams {
  venue_id: string;
  org_id: string;
  triggered_by: 'cron' | 'manual' | 'signal';
  signal_type?: string;
}

export interface MenuAgentRunResult {
  items_evaluated: number;
  signals_detected: number;
  recommendations_generated: number;
  auto_executed: number;
  pending_approval: number;
  prices_queued: number;
  agent_reasoning: Record<string, unknown>;
  error_message?: string;
  status?: 'running' | 'completed' | 'failed';
}

export interface MenuRecommendation {
  run_id: string;
  venue_id: string;
  org_id: string;
  recipe_id?: string;
  menu_item_name?: string;
  action_type: MenuActionType;
  reasoning: string;
  expected_impact: Record<string, unknown>;
  status?: 'pending' | 'approved' | 'rejected' | 'auto_executed' | 'expired';
  price_queue_id?: string;
  violation_id?: string;
}

export interface MenuItemPerformance {
  venue_id: string;
  recipe_id: string;
  recipe_name: string;
  item_category: string;
  menu_price: number;
  cost_per_unit: number;
  gp_per_unit: number;
  total_qty: number;
  total_revenue: number;
  days_observed: number;
  velocity_per_week: number;
  contribution_margin_per_week: number;
  revenue_pct: number;
  food_cost_pct: number;
  trend: 'new' | 'rising' | 'declining' | 'stable';
  trend_pct: number | null;
  is_underperformer: boolean;
}

export interface MenuItemSurface {
  id: string;
  venue_id: string;
  recipe_id: string;
  surface: string;
  reprint_cycle_days: number | null;
  next_reprint_date: string | null;
  is_market_price: boolean;
}

// ── Settings ──────────────────────────────────────────────────

export async function getMenuAgentSettings(orgId: string): Promise<any | null> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('menu_agent_settings')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .is('effective_to', null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function updateMenuAgentSettings(
  orgId: string,
  updates: Record<string, unknown>,
  userId: string
): Promise<{ success: boolean; version?: number; error?: string }> {
  const supabase = getServiceClient();

  // Retire current version
  const current = await getMenuAgentSettings(orgId);
  const newVersion = current ? current.version + 1 : 1;

  if (current) {
    await (supabase as any)
      .from('menu_agent_settings')
      .update({ effective_to: new Date().toISOString() })
      .eq('id', current.id);
  }

  // Insert new version
  const { error } = await (supabase as any)
    .from('menu_agent_settings')
    .insert({
      org_id: orgId,
      version: newVersion,
      ...updates,
      created_by: userId,
    });

  if (error) return { success: false, error: error.message };
  return { success: true, version: newVersion };
}

// ── Item Surfaces ──────────────────────────────────────────

export async function getMenuItemSurfaces(venueId: string): Promise<MenuItemSurface[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('menu_item_surfaces')
    .select('*')
    .eq('venue_id', venueId);

  if (error) {
    console.error('[MenuAgent] Error fetching item surfaces:', error.message);
    return [];
  }

  return (data || []) as MenuItemSurface[];
}

export async function upsertMenuItemSurface(params: {
  venue_id: string;
  recipe_id: string;
  surface: string;
  reprint_cycle_days?: number;
  next_reprint_date?: string;
  is_market_price?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('menu_item_surfaces')
    .upsert(
      {
        venue_id: params.venue_id,
        recipe_id: params.recipe_id,
        surface: params.surface,
        reprint_cycle_days: params.reprint_cycle_days ?? null,
        next_reprint_date: params.next_reprint_date ?? null,
        is_market_price: params.is_market_price ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id,recipe_id' }
    );

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Agent Runs ──────────────────────────────────────────────

export async function createMenuAgentRun(params: MenuAgentRunParams): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('menu_agent_runs')
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

  if (error) throw new Error(`Failed to create menu agent run: ${error.message}`);
  return data.id;
}

export async function updateMenuAgentRun(
  runId: string,
  result: MenuAgentRunResult
): Promise<void> {
  const supabase = getServiceClient();
  const status = result.status || 'completed';

  const { error } = await (supabase as any)
    .from('menu_agent_runs')
    .update({
      items_evaluated: result.items_evaluated,
      signals_detected: result.signals_detected,
      recommendations_generated: result.recommendations_generated,
      auto_executed: result.auto_executed,
      pending_approval: result.pending_approval,
      prices_queued: result.prices_queued,
      agent_reasoning: result.agent_reasoning,
      error_message: result.error_message || null,
      status,
      completed_at: status !== 'running' ? new Date().toISOString() : null,
    })
    .eq('id', runId);

  if (error) {
    console.error('[MenuAgent] Error updating run:', error.message);
  }
}

export async function getRecentMenuAgentRuns(
  venueId: string,
  limit: number = 10
): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('menu_agent_runs')
    .select('*')
    .eq('venue_id', venueId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

// ── Recommendations ──────────────────────────────────────────

export async function insertRecommendation(
  rec: MenuRecommendation
): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('menu_agent_recommendations')
    .insert({
      run_id: rec.run_id,
      venue_id: rec.venue_id,
      org_id: rec.org_id,
      recipe_id: rec.recipe_id || null,
      menu_item_name: rec.menu_item_name || null,
      action_type: rec.action_type,
      reasoning: rec.reasoning,
      expected_impact: rec.expected_impact,
      status: rec.status || 'pending',
      price_queue_id: rec.price_queue_id || null,
      violation_id: rec.violation_id || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert recommendation: ${error.message}`);
  return data.id;
}

export async function insertRecommendations(
  recs: MenuRecommendation[]
): Promise<string[]> {
  if (recs.length === 0) return [];
  const ids: string[] = [];
  for (const rec of recs) {
    const id = await insertRecommendation(rec);
    ids.push(id);
  }
  return ids;
}

export async function updateRecommendationStatus(
  recId: string,
  status: 'approved' | 'rejected' | 'auto_executed' | 'expired',
  userId?: string,
  reason?: string
): Promise<void> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const update: Record<string, unknown> = { status };

  if (status === 'approved') {
    update.approved_by = userId;
    update.approved_at = now;
  } else if (status === 'auto_executed') {
    update.executed_at = now;
  } else if (status === 'rejected') {
    update.rejected_reason = reason || null;
  }

  const { error } = await (supabase as any)
    .from('menu_agent_recommendations')
    .update(update)
    .eq('id', recId);

  if (error) {
    console.error('[MenuAgent] Error updating recommendation:', error.message);
  }
}

export async function getPendingRecommendations(venueId: string): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('menu_agent_recommendations')
    .select('*')
    .eq('venue_id', venueId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return data || [];
}

export async function getRecommendationsByRun(runId: string): Promise<any[]> {
  const supabase = getServiceClient();

  const { data } = await (supabase as any)
    .from('menu_agent_recommendations')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  return data || [];
}

/**
 * Record outcome data for a recommendation (feedback loop).
 */
export async function recordRecommendationOutcome(
  recId: string,
  outcomeData: Record<string, unknown>
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await (supabase as any)
    .from('menu_agent_recommendations')
    .update({
      outcome_tracked: true,
      outcome_data: outcomeData,
    })
    .eq('id', recId);

  if (error) {
    console.error('[MenuAgent] Error recording outcome:', error.message);
  }
}

// ── Performance Views ──────────────────────────────────────────

export async function getMenuItemPerformance(
  venueId: string
): Promise<MenuItemPerformance[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('v_menu_item_performance')
    .select('*')
    .eq('venue_id', venueId);

  if (error) {
    if (shouldSilenceMissingRelationError('menu-agent', 'v_menu_item_performance', error)) {
      return [];
    }
    console.error('[MenuAgent] Error fetching item performance:', error.message);
    return [];
  }

  return (data || []) as MenuItemPerformance[];
}

export async function getContributionMargins(
  venueId: string
): Promise<any[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('v_contribution_margin')
    .select('*')
    .eq('venue_id', venueId)
    .order('contribution_margin_per_week', { ascending: false });

  if (error) {
    console.error('[MenuAgent] Error fetching contribution margins:', error.message);
    return [];
  }

  return data || [];
}

export async function getDemandElasticity(
  venueId: string,
  recipeId?: string
): Promise<any[]> {
  const supabase = getServiceClient();

  let query = (supabase as any)
    .from('v_demand_elasticity')
    .select('*')
    .eq('venue_id', venueId);

  if (recipeId) {
    query = query.eq('recipe_id', recipeId);
  }

  const { data, error } = await query.order('change_date', { ascending: false });

  if (error) {
    console.error('[MenuAgent] Error fetching elasticity:', error.message);
    return [];
  }

  return data || [];
}

export async function getMenuMarginHealth(venueId: string): Promise<any[]> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('v_menu_margin_health')
    .select('*')
    .eq('venue_id', venueId);

  if (error) {
    if (shouldSilenceMissingRelationError('menu-agent', 'v_menu_margin_health', error)) {
      return [];
    }
    console.error('[MenuAgent] Error fetching margin health:', error.message);
    return [];
  }

  return data || [];
}

// ── Price History ──────────────────────────────────────────────

export async function recordPriceChange(params: {
  venue_id: string;
  recipe_id: string;
  old_price: number;
  new_price: number;
  source: 'menu_agent' | 'manual' | 'pos_sync' | 'recipe_version' | 'seasonal_update';
  recommendation_id?: string;
  notes?: string;
}): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await (supabase as any)
    .from('menu_price_history')
    .insert({
      venue_id: params.venue_id,
      recipe_id: params.recipe_id,
      old_price: params.old_price,
      new_price: params.new_price,
      source: params.source,
      recommendation_id: params.recommendation_id || null,
      notes: params.notes || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to record price change: ${error.message}`);
  return data.id;
}

// ── Agent-Enabled Venues ──────────────────────────────────────

export async function getMenuAgentEnabledVenues(): Promise<
  Array<{ venue_id: string; org_id: string; venue_name: string }>
> {
  const supabase = getServiceClient();

  const { data: settings } = await (supabase as any)
    .from('menu_agent_settings')
    .select('org_id')
    .eq('is_active', true)
    .is('effective_to', null)
    .neq('mode', 'advise');

  if (!settings || settings.length === 0) return [];

  const orgIds = [...new Set(settings.map((s: any) => s.org_id))];

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
