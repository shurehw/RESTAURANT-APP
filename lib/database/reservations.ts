/**
 * lib/database/reservations.ts
 * Data access layer for native reservations and access rules.
 * Pattern: lib/database/floor-plan.ts
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export interface Reservation {
  id: string;
  org_id: string;
  venue_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  party_size: number;
  business_date: string;
  arrival_time: string;
  seated_time: string | null;
  departed_time: string | null;
  expected_duration: number;
  table_ids: string[];
  section_id: string | null;
  server_id: string | null;
  status: ReservationStatus;
  channel: ReservationChannel;
  external_id: string | null;
  external_channel_id: string | null;
  is_vip: boolean;
  tags: unknown[];
  notes: string | null;
  client_requests: string | null;
  min_spend: number | null;
  booked_by: string | null;
  booked_at: string;
  pos_check_ids: string[];
  actual_spend: number | null;
  last_synced_at: string | null;
  sync_source: string | null;
  created_at: string;
  updated_at: string;
}

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'waitlisted'
  | 'arrived'
  | 'seated'
  | 'no_show'
  | 'cancelled'
  | 'completed';

export type ReservationChannel =
  | 'direct'
  | 'sevenrooms'
  | 'resy'
  | 'opentable'
  | 'phone'
  | 'walkin'
  | 'concierge'
  | 'agent';

export interface ReservationAccessRule {
  id: string;
  org_id: string;
  venue_id: string;
  name: string;
  shift_type: string;
  section_id: string | null;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  max_covers_per_interval: number;
  custom_pacing: Record<string, number>;
  min_party_size: number;
  max_party_size: number;
  turn_times: Record<string, number>;
  channel_allocation: Record<string, number>;
  min_spend: number | null;
  service_charge_pct: number;
  gratuity_pct: number;
  requires_deposit: boolean;
  deposit_amount: number | null;
  active_days: number[];
  effective_from: string | null;
  effective_until: string | null;
  ai_managed: boolean;
  last_ai_change_at: string | null;
  last_ai_change_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AccessRuleChange {
  id: string;
  rule_id: string;
  change_type: 'ai_adjustment' | 'manual_override' | 'schedule_change' | 'creation';
  field_changed: string;
  old_value: unknown;
  new_value: unknown;
  reasoning: string | null;
  changed_by: string | null;
  changed_by_model: string | null;
  recommendation_id: string | null;
  created_at: string;
}

export interface ReservationEvent {
  id: string;
  reservation_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_id: string | null;
  actor_type: 'user' | 'system' | 'ai' | 'sync';
  metadata: Record<string, unknown>;
  occurred_at: string;
}

// ── Valid state transitions ──────────────────────────────────────

const VALID_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ['confirmed', 'cancelled', 'waitlisted'],
  confirmed: ['arrived', 'cancelled', 'no_show', 'waitlisted'],
  waitlisted: ['confirmed', 'cancelled'],
  arrived: ['seated', 'cancelled', 'no_show'],
  seated: ['completed'],
  no_show: [],
  cancelled: [],
  completed: [],
};

// ── Reservations: Queries ────────────────────────────────────────

/**
 * Get all active reservations for a venue on a date.
 * Excludes cancelled, no_show, and completed.
 */
export async function getActiveReservationsForVenueDate(
  venueId: string,
  date: string,
): Promise<Reservation[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('reservations')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .not('status', 'in', '("cancelled","no_show","completed")')
    .order('arrival_time', { ascending: true });

  if (error) {
    console.error('[reservations] Failed to fetch active:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get all reservations for a venue on a date (any status).
 */
export async function getReservationsForVenueDate(
  venueId: string,
  date: string,
): Promise<Reservation[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('reservations')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('arrival_time', { ascending: true });

  if (error) {
    console.error('[reservations] Failed to fetch:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get a single reservation by ID.
 */
export async function getReservationById(id: string): Promise<Reservation | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('reservations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[reservations] Failed to fetch by id:', error.message);
    return null;
  }
  return data;
}

// ── Reservations: CRUD ───────────────────────────────────────────

/**
 * Upsert a reservation. Deduplicates by (venue_id, channel, external_id).
 */
export async function upsertReservation(
  orgId: string,
  venueId: string,
  data: Partial<Omit<Reservation, 'id' | 'org_id' | 'venue_id' | 'created_at' | 'updated_at'>>,
): Promise<Reservation> {
  const supabase = getServiceClient();

  const row = {
    org_id: orgId,
    venue_id: venueId,
    ...data,
    updated_at: new Date().toISOString(),
  };

  // If we have channel + external_id, use them for dedup
  const onConflict = data.channel && data.external_id
    ? 'venue_id,channel,external_id'
    : undefined;

  const query = onConflict
    ? (supabase as any).from('reservations').upsert(row, { onConflict }).select().single()
    : (supabase as any).from('reservations').insert(row).select().single();

  const { data: result, error } = await query;

  if (error) throw error;
  return result;
}

/**
 * Update specific fields on a reservation.
 */
export async function updateReservation(
  id: string,
  updates: Partial<Pick<Reservation,
    'first_name' | 'last_name' | 'email' | 'phone' | 'party_size' |
    'arrival_time' | 'expected_duration' | 'table_ids' | 'section_id' |
    'server_id' | 'is_vip' | 'tags' | 'notes' | 'client_requests' |
    'min_spend' | 'pos_check_ids' | 'actual_spend'
  >>,
): Promise<Reservation | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('reservations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[reservations] Failed to update:', error.message);
    return null;
  }
  return data;
}

// ── Reservations: Status Transitions ─────────────────────────────

/**
 * Transition a reservation to a new status.
 * Enforces valid state machine transitions.
 */
export async function transitionReservationStatus(
  id: string,
  toStatus: ReservationStatus,
  actorId: string | null,
  actorType: 'user' | 'system' | 'ai' | 'sync' = 'user',
  metadata: Record<string, unknown> = {},
): Promise<{ success: boolean; error?: string }> {
  const rez = await getReservationById(id);
  if (!rez) return { success: false, error: 'Reservation not found' };

  const validTargets = VALID_TRANSITIONS[rez.status];
  if (!validTargets.includes(toStatus)) {
    return {
      success: false,
      error: `Invalid transition: ${rez.status} → ${toStatus}. Valid: ${validTargets.join(', ')}`,
    };
  }

  const supabase = getServiceClient();

  // Update status with optimistic concurrency
  const { error: updateErr } = await (supabase as any)
    .from('reservations')
    .update({
      status: toStatus,
      ...(toStatus === 'seated' ? { seated_time: new Date().toISOString() } : {}),
      ...(toStatus === 'completed' ? { departed_time: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', rez.status); // Optimistic concurrency

  if (updateErr) {
    console.error('[reservations] Transition failed:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  // Log event
  await insertReservationEvent({
    reservation_id: id,
    event_type: toStatus === 'cancelled' ? 'cancelled'
      : toStatus === 'no_show' ? 'no_show'
      : toStatus === 'arrived' ? 'arrived'
      : toStatus === 'seated' ? 'seated'
      : toStatus === 'completed' ? 'completed'
      : toStatus === 'confirmed' ? 'confirmed'
      : 'modified',
    from_status: rez.status,
    to_status: toStatus,
    actor_id: actorId,
    actor_type: actorType,
    metadata,
  });

  return { success: true };
}

// ── Reservation Events ───────────────────────────────────────────

export async function insertReservationEvent(event: {
  reservation_id: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  actor_id?: string | null;
  actor_type?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await (supabase as any)
    .from('reservation_events')
    .insert({
      reservation_id: event.reservation_id,
      event_type: event.event_type,
      from_status: event.from_status || null,
      to_status: event.to_status || null,
      actor_id: event.actor_id || null,
      actor_type: event.actor_type || 'system',
      metadata: event.metadata || {},
    });

  if (error) {
    console.error('[reservations] Failed to insert event:', error.message);
  }
}

// ── Access Rules: Queries ────────────────────────────────────────

/**
 * Get all access rules for a venue.
 */
export async function getAccessRulesForVenue(
  venueId: string,
): Promise<ReservationAccessRule[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('reservation_access_rules')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[reservations] Failed to fetch access rules:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get active access rules for a venue on a specific date.
 * Filters by active_days (DOW), effective_from/until range.
 */
export async function getActiveAccessRulesForDate(
  venueId: string,
  date: string,
): Promise<ReservationAccessRule[]> {
  const dow = new Date(date + 'T12:00:00').getDay();
  const rules = await getAccessRulesForVenue(venueId);

  return rules.filter(rule => {
    // Check day-of-week
    if (!rule.active_days.includes(dow)) return false;
    // Check effective date range
    if (rule.effective_from && date < rule.effective_from) return false;
    if (rule.effective_until && date > rule.effective_until) return false;
    return true;
  });
}

// ── Access Rules: CRUD ───────────────────────────────────────────

/**
 * Upsert an access rule.
 */
export async function upsertAccessRule(
  orgId: string,
  venueId: string,
  data: Partial<Omit<ReservationAccessRule, 'id' | 'org_id' | 'venue_id' | 'created_at' | 'updated_at'>>,
  userId?: string,
): Promise<ReservationAccessRule> {
  const supabase = getServiceClient();

  const row = {
    org_id: orgId,
    venue_id: venueId,
    ...data,
    updated_by: userId || null,
    updated_at: new Date().toISOString(),
  };

  const { data: result, error } = await (supabase as any)
    .from('reservation_access_rules')
    .upsert(row, { onConflict: 'venue_id,name,shift_type' })
    .select()
    .single();

  if (error) throw error;
  return result;
}

/**
 * Update an access rule.
 */
export async function updateAccessRule(
  ruleId: string,
  updates: Partial<Pick<ReservationAccessRule,
    'max_covers_per_interval' | 'custom_pacing' | 'turn_times' |
    'channel_allocation' | 'min_spend' | 'min_party_size' | 'max_party_size' |
    'active_days' | 'effective_from' | 'effective_until' | 'is_active' |
    'ai_managed'
  >>,
  userId?: string,
): Promise<ReservationAccessRule | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('reservation_access_rules')
    .update({
      ...updates,
      updated_by: userId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ruleId)
    .select()
    .single();

  if (error) {
    console.error('[reservations] Failed to update access rule:', error.message);
    return null;
  }
  return data;
}

// ── Access Rules: AI Direct Modification ─────────────────────────

/**
 * AI agent directly modifies an access rule with full audit trail.
 * Only works on rules where ai_managed = true.
 */
export async function aiAdjustAccessRule(
  ruleId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  reasoning: string,
  model: string,
  recommendationId?: string,
): Promise<AccessRuleChange | null> {
  const supabase = getServiceClient();

  // Verify rule exists and is AI-managed
  const { data: rule, error: ruleErr } = await (supabase as any)
    .from('reservation_access_rules')
    .select('id, ai_managed')
    .eq('id', ruleId)
    .single();

  if (ruleErr || !rule) {
    console.error('[reservations] AI adjust: rule not found:', ruleErr?.message);
    return null;
  }

  if (!rule.ai_managed) {
    console.error('[reservations] AI adjust: rule is not AI-managed');
    return null;
  }

  // Apply the change
  const { error: updateErr } = await (supabase as any)
    .from('reservation_access_rules')
    .update({
      [field]: newValue,
      last_ai_change_at: new Date().toISOString(),
      last_ai_change_by: model,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ruleId);

  if (updateErr) {
    console.error('[reservations] AI adjust: update failed:', updateErr.message);
    return null;
  }

  // Log the change
  const { data: change, error: changeErr } = await (supabase as any)
    .from('access_rule_changes')
    .insert({
      rule_id: ruleId,
      change_type: 'ai_adjustment',
      field_changed: field,
      old_value: JSON.stringify(oldValue),
      new_value: JSON.stringify(newValue),
      reasoning,
      changed_by_model: model,
      recommendation_id: recommendationId || null,
    })
    .select()
    .single();

  if (changeErr) {
    console.error('[reservations] AI adjust: audit log failed:', changeErr.message);
    return null;
  }

  return change;
}

// ── Pacing Enforcement ───────────────────────────────────────────

/**
 * Get remaining covers for a specific time slot under a rule.
 * Used to enforce pacing limits on new bookings.
 */
export async function getRemainingCoversForSlot(
  venueId: string,
  date: string,
  ruleId: string,
  slotTime: string,
): Promise<{ limit: number; booked: number; remaining: number }> {
  // Get the rule
  const supabase = getServiceClient();
  const { data: rule } = await (supabase as any)
    .from('reservation_access_rules')
    .select('max_covers_per_interval, custom_pacing, interval_minutes')
    .eq('id', ruleId)
    .single();

  if (!rule) return { limit: 0, booked: 0, remaining: 0 };

  // Slot-level override or default
  const limit = rule.custom_pacing?.[slotTime] ?? rule.max_covers_per_interval;

  // Count booked covers in this slot
  const intervalMinutes = rule.interval_minutes || 30;
  const [h, m] = slotTime.split(':').map(Number);
  const slotStartMinutes = h * 60 + m;
  const slotEndMinutes = slotStartMinutes + intervalMinutes;

  const { data: rezs } = await (supabase as any)
    .from('reservations')
    .select('party_size, arrival_time')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .not('status', 'in', '("cancelled","no_show")');

  let booked = 0;
  for (const rez of rezs || []) {
    const [rh, rm] = (rez.arrival_time || '00:00').split(':').map(Number);
    const rezMinutes = rh * 60 + rm;
    if (rezMinutes >= slotStartMinutes && rezMinutes < slotEndMinutes) {
      booked += rez.party_size || 0;
    }
  }

  return { limit, booked, remaining: Math.max(0, limit - booked) };
}

/**
 * Get covers booked per slot for a venue on a date.
 * Returns a map of slot time ("HH:MM") → total covers.
 */
export async function getCoversBookedPerSlot(
  venueId: string,
  date: string,
  intervalMinutes: number = 30,
): Promise<Map<string, number>> {
  const supabase = getServiceClient();
  const { data: rezs } = await (supabase as any)
    .from('reservations')
    .select('party_size, arrival_time')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .not('status', 'in', '("cancelled","no_show")');

  const slotMap = new Map<string, number>();

  for (const rez of rezs || []) {
    const [h, m] = (rez.arrival_time || '00:00').split(':').map(Number);
    // Round down to slot boundary
    const slotM = Math.floor(m / intervalMinutes) * intervalMinutes;
    const key = `${String(h).padStart(2, '0')}:${String(slotM).padStart(2, '0')}`;
    slotMap.set(key, (slotMap.get(key) || 0) + (rez.party_size || 0));
  }

  return slotMap;
}

// ── Access Rule Changes: Query ───────────────────────────────────

/**
 * Get recent changes for an access rule.
 */
export async function getAccessRuleChanges(
  ruleId: string,
  limit: number = 20,
): Promise<AccessRuleChange[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('access_rule_changes')
    .select('*')
    .eq('rule_id', ruleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[reservations] Failed to fetch changes:', error.message);
    return [];
  }
  return data || [];
}
