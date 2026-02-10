/**
 * Signal Writer - Writes detection signals to the feedback spine
 *
 * Detectors (comp exceptions, labor violations, etc.) call writeSignal()
 * to create unified signals that feed into the feedback object system.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type FeedbackDomain = 'revenue' | 'labor' | 'procurement' | 'service' | 'compliance';
export type SignalSource = 'rule' | 'model' | 'ai';
export type FeedbackSeverity = 'info' | 'warning' | 'critical';

export interface SignalInput {
  // Scoping
  orgId: string;
  venueId?: string;
  businessDate: string; // YYYY-MM-DD

  // Classification
  domain: FeedbackDomain;
  signalType: string; // e.g., 'comp_unapproved_reason', 'cplh_over_target'
  source?: SignalSource;
  severity?: FeedbackSeverity;
  confidence?: number; // 0.0 to 1.0

  // Impact
  impactValue?: number;
  impactUnit?: string; // 'usd', 'hours', 'minutes', 'percent'

  // Entity reference
  entityType?: string; // 'check', 'comp', 'server', 'invoice'
  entityId?: string;

  // Signal details
  payload?: Record<string, any>;

  // Deduplication key (auto-generated if not provided)
  dedupeKey?: string;

  // Audit
  detectedRunId?: string;
}

export interface Signal extends SignalInput {
  id: string;
  dedupeKey: string;
  detectedAt: string;
  createdAt: string;
}

/**
 * Write a signal to the database
 * Returns the signal if created, or null if deduplicated
 */
export async function writeSignal(input: SignalInput): Promise<Signal | null> {
  // Auto-generate dedupe key if not provided
  const dedupeKey = input.dedupeKey || generateDedupeKey(input);

  const signal = {
    org_id: input.orgId,
    venue_id: input.venueId || null,
    business_date: input.businessDate,
    domain: input.domain,
    signal_type: input.signalType,
    source: input.source || 'rule',
    severity: input.severity || 'warning',
    confidence: input.confidence || null,
    impact_value: input.impactValue || null,
    impact_unit: input.impactUnit || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    payload: input.payload || {},
    dedupe_key: dedupeKey,
    detected_run_id: input.detectedRunId || null,
  };

  const { data, error } = await supabase
    .from('signals')
    .insert([signal])
    .select()
    .single();

  if (error) {
    // Check if it's a duplicate (unique constraint violation)
    if (error.code === '23505') {
      console.log(`Signal deduplicated: ${dedupeKey}`);
      return null; // Already exists
    }
    throw new Error(`Failed to write signal: ${error.message}`);
  }

  return {
    id: data.id,
    orgId: data.org_id,
    venueId: data.venue_id,
    businessDate: data.business_date,
    domain: data.domain,
    signalType: data.signal_type,
    source: data.source,
    severity: data.severity,
    confidence: data.confidence,
    impactValue: data.impact_value,
    impactUnit: data.impact_unit,
    entityType: data.entity_type,
    entityId: data.entity_id,
    payload: data.payload,
    dedupeKey: data.dedupe_key,
    detectedAt: data.detected_at,
    createdAt: data.created_at,
  };
}

/**
 * Write multiple signals in a batch
 * Returns array of created signals (excludes duplicates)
 */
export async function writeSignals(inputs: SignalInput[]): Promise<Signal[]> {
  if (inputs.length === 0) return [];

  // Add dedupe keys to all inputs
  const signals = inputs.map(input => ({
    org_id: input.orgId,
    venue_id: input.venueId || null,
    business_date: input.businessDate,
    domain: input.domain,
    signal_type: input.signalType,
    source: input.source || 'rule',
    severity: input.severity || 'warning',
    confidence: input.confidence || null,
    impact_value: input.impactValue || null,
    impact_unit: input.impactUnit || null,
    entity_type: input.entityType || null,
    entity_id: input.entityId || null,
    payload: input.payload || {},
    dedupe_key: input.dedupeKey || generateDedupeKey(input),
    detected_run_id: input.detectedRunId || null,
  }));

  const { data, error } = await supabase
    .from('signals')
    .insert(signals)
    .select();

  if (error) {
    // If bulk insert fails due to duplicates, fall back to individual inserts
    if (error.code === '23505') {
      console.log(`Batch insert had duplicates, falling back to individual inserts`);
      const results: Signal[] = [];
      for (const input of inputs) {
        const signal = await writeSignal(input);
        if (signal) results.push(signal);
      }
      return results;
    }
    throw new Error(`Failed to write signals: ${error.message}`);
  }

  return (data || []).map(d => ({
    id: d.id,
    orgId: d.org_id,
    venueId: d.venue_id,
    businessDate: d.business_date,
    domain: d.domain,
    signalType: d.signal_type,
    source: d.source,
    severity: d.severity,
    confidence: d.confidence,
    impactValue: d.impact_value,
    impactUnit: d.impact_unit,
    entityType: d.entity_type,
    entityId: d.entity_id,
    payload: d.payload,
    dedupeKey: d.dedupe_key,
    detectedAt: d.detected_at,
    createdAt: d.created_at,
  }));
}

/**
 * Generate a deterministic dedupe key from signal attributes
 */
function generateDedupeKey(input: SignalInput): string {
  const parts = [
    input.domain,
    input.signalType,
    input.entityType || 'none',
    input.entityId || 'none',
  ];

  // Add payload hash if payload is non-empty
  if (input.payload && Object.keys(input.payload).length > 0) {
    const payloadStr = JSON.stringify(input.payload, Object.keys(input.payload).sort());
    parts.push(simpleHash(payloadStr));
  }

  return parts.join(':');
}

/**
 * Simple string hash for dedupe keys
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Fetch signals for a given date/venue
 */
export async function getSignals(params: {
  orgId: string;
  venueId?: string;
  businessDate?: string;
  domain?: FeedbackDomain;
  severity?: FeedbackSeverity;
  limit?: number;
}): Promise<Signal[]> {
  let query = supabase
    .from('signals')
    .select('*')
    .eq('org_id', params.orgId)
    .order('detected_at', { ascending: false });

  if (params.venueId) {
    query = query.eq('venue_id', params.venueId);
  }
  if (params.businessDate) {
    query = query.eq('business_date', params.businessDate);
  }
  if (params.domain) {
    query = query.eq('domain', params.domain);
  }
  if (params.severity) {
    query = query.eq('severity', params.severity);
  }
  if (params.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch signals: ${error.message}`);
  }

  return (data || []).map(d => ({
    id: d.id,
    orgId: d.org_id,
    venueId: d.venue_id,
    businessDate: d.business_date,
    domain: d.domain,
    signalType: d.signal_type,
    source: d.source,
    severity: d.severity,
    confidence: d.confidence,
    impactValue: d.impact_value,
    impactUnit: d.impact_unit,
    entityType: d.entity_type,
    entityId: d.entity_id,
    payload: d.payload,
    dedupeKey: d.dedupe_key,
    detectedAt: d.detected_at,
    createdAt: d.created_at,
  }));
}
