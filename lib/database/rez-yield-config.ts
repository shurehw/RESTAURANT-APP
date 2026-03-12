/**
 * Rez Yield Engine — Configuration CRUD
 *
 * Per-venue guardrails and settings for the yield management engine.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Types ──────────────────────────────────────────────────

export interface RezYieldConfig {
  id: string;
  org_id: string;
  venue_id: string;
  yield_engine_enabled: boolean;
  service_start_time: string;
  service_end_time: string;
  automation_level: 'advisory' | 'semi_auto' | 'autonomous';
  aggressiveness_ceiling: number;
  max_overbook_pct: number;
  overbook_noshow_floor: number;
  walkin_reserve_pct: number;
  vip_table_ids: string[];
  vip_protection_level: number;
  protect_large_tops: boolean;
  large_top_threshold: number;
  blocked_section_ids: string[];
  max_pacing_delta_pct: number;
  sr_push_enabled: boolean;
  turn_buffer_minutes: number;
  end_of_service_compress: boolean;
  max_stress_score: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type RezYieldConfigUpdate = Partial<
  Omit<RezYieldConfig, 'id' | 'org_id' | 'venue_id' | 'created_at' | 'updated_at'>
>;

// ── Queries ────────────────────────────────────────────────

export async function getYieldConfig(venueId: string): Promise<RezYieldConfig | null> {
  const { data, error } = await supabase
    .from('rez_yield_config')
    .select('*')
    .eq('venue_id', venueId)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch yield config: ${error.message}`);
  return data;
}

export async function getYieldConfigOrDefault(venueId: string): Promise<RezYieldConfig> {
  const config = await getYieldConfig(venueId);
  if (config) return config;

  // Return defaults (not persisted until explicitly saved)
  return {
    id: '',
    org_id: '',
    venue_id: venueId,
    yield_engine_enabled: false,
    service_start_time: '16:00',
    service_end_time: '02:00',
    automation_level: 'advisory',
    aggressiveness_ceiling: 60,
    max_overbook_pct: 10,
    overbook_noshow_floor: 5,
    walkin_reserve_pct: 15,
    vip_table_ids: [],
    vip_protection_level: 70,
    protect_large_tops: true,
    large_top_threshold: 4,
    blocked_section_ids: [],
    max_pacing_delta_pct: 25,
    sr_push_enabled: false,
    turn_buffer_minutes: 15,
    end_of_service_compress: true,
    max_stress_score: 75,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

export async function upsertYieldConfig(
  orgId: string,
  venueId: string,
  updates: RezYieldConfigUpdate,
  userId?: string,
): Promise<RezYieldConfig> {
  const { data, error } = await supabase
    .from('rez_yield_config')
    .upsert(
      {
        org_id: orgId,
        venue_id: venueId,
        ...updates,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      },
      { onConflict: 'venue_id' },
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert yield config: ${error.message}`);
  return data;
}

export async function getEnabledVenues(orgId?: string): Promise<{ venue_id: string; org_id: string }[]> {
  let query = supabase
    .from('rez_yield_config')
    .select('venue_id, org_id')
    .eq('yield_engine_enabled', true);

  if (orgId) query = query.eq('org_id', orgId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch enabled venues: ${error.message}`);
  return data || [];
}

// ── Decision Logging ───────────────────────────────────────

export interface YieldDecisionInput {
  org_id: string;
  venue_id: string;
  business_date: string;
  decision_type: string;
  request_id?: string;
  reservation_id?: string;
  recommendation: string;
  confidence: number;
  reasoning: string;
  payload: Record<string, unknown>;
}

export async function logYieldDecision(input: YieldDecisionInput): Promise<string> {
  const { data, error } = await supabase
    .from('rez_yield_decisions')
    .insert(input)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to log yield decision: ${error.message}`);
  return data.id;
}

export async function recordDecisionOutcome(
  decisionId: string,
  wasFollowed: boolean,
  overrideReason?: string,
  outcomeRevenue?: number,
): Promise<void> {
  const { error } = await supabase
    .from('rez_yield_decisions')
    .update({
      was_followed: wasFollowed,
      override_reason: overrideReason || null,
      outcome_revenue: outcomeRevenue || null,
    })
    .eq('id', decisionId);

  if (error) throw new Error(`Failed to record decision outcome: ${error.message}`);
}

export async function getRecentDecisions(
  venueId: string,
  date: string,
  limit = 50,
): Promise<YieldDecisionInput[]> {
  const { data, error } = await supabase
    .from('rez_yield_decisions')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch decisions: ${error.message}`);
  return data || [];
}

// ── Posture Logging ────────────────────────────────────────

export interface PostureSnapshot {
  venue_id: string;
  business_date: string;
  shift_type: string;
  posture: 'aggressive' | 'open' | 'balanced' | 'protected' | 'highly_protected';
  slot_scores: Record<string, { protection: number; fill_risk: number; future_opportunity: number }>;
  pickup_vs_pace: number;
  total_booked: number;
  total_capacity: number;
  demand_signals: Record<string, unknown>;
}

export async function logPostureSnapshot(snapshot: PostureSnapshot): Promise<void> {
  const { error } = await supabase
    .from('rez_yield_posture_log')
    .insert(snapshot);

  if (error) throw new Error(`Failed to log posture: ${error.message}`);
}

export async function getLatestPosture(
  venueId: string,
  date: string,
  shiftType: string,
): Promise<PostureSnapshot | null> {
  const { data, error } = await supabase
    .from('rez_yield_posture_log')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('shift_type', shiftType)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch posture: ${error.message}`);
  return data;
}
