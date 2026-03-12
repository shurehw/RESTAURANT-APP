/**
 * Table State Machine — Enforced Lifecycle Transitions
 *
 * Valid transitions:
 *   available    → reserved | seated | blocked
 *   reserved     → seated | available (cancel/no-show)
 *   seated       → occupied (POS check opens)
 *   occupied     → check_dropped (POS check closes)
 *   check_dropped → bussing
 *   bussing      → available
 *   blocked      → available
 *
 * Every transition:
 *   1. Validates current status via optimistic concurrency
 *   2. Updates the table_status row
 *   3. Inserts an append-only table_status_events row
 *
 * Pattern: lib/enforcement/state-machine.ts
 */

import { getServiceClient } from '@/lib/supabase/service';

// ── Types ────────────────────────────────────────────────────────

export type TableState =
  | 'available'
  | 'reserved'
  | 'seated'
  | 'occupied'
  | 'check_dropped'
  | 'bussing'
  | 'blocked';

export interface TableTransitionResult {
  success: boolean;
  table_id: string;
  from_status: TableState;
  to_status: TableState;
  error?: string;
}

// ── Valid Transitions ────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TableState, TableState[]> = {
  available: ['reserved', 'seated', 'blocked'],
  reserved: ['seated', 'available'],
  seated: ['occupied'],
  occupied: ['check_dropped'],
  check_dropped: ['bussing'],
  bussing: ['available'],
  blocked: ['available'],
};

// ── Event Type Mapping ───────────────────────────────────────────

function eventTypeForTransition(to: TableState): string {
  switch (to) {
    case 'reserved': return 'reserved';
    case 'seated': return 'seated';
    case 'occupied': return 'occupied';
    case 'check_dropped': return 'check_dropped';
    case 'bussing': return 'bussing';
    case 'available': return 'cleared';
    case 'blocked': return 'blocked';
    default: return 'cleared';
  }
}

// ── Ensure Table Status Row ──────────────────────────────────────

/**
 * Ensure a table_status row exists for this table/date.
 * Creates one with 'available' status if missing.
 */
async function ensureTableStatus(
  venueId: string,
  orgId: string,
  tableId: string,
  date: string,
): Promise<{ id: string; status: TableState; turn_number: number }> {
  const supabase = getServiceClient();

  // Try to fetch existing
  const { data: existing } = await (supabase as any)
    .from('table_status')
    .select('id, status, turn_number')
    .eq('venue_id', venueId)
    .eq('table_id', tableId)
    .eq('business_date', date)
    .maybeSingle();

  if (existing) return existing;

  // Create new
  const { data: created, error } = await (supabase as any)
    .from('table_status')
    .insert({
      org_id: orgId,
      venue_id: venueId,
      table_id: tableId,
      business_date: date,
      status: 'available',
      turn_number: 0,
    })
    .select('id, status, turn_number')
    .single();

  if (error) {
    // Race condition — another process created it
    const { data: retry } = await (supabase as any)
      .from('table_status')
      .select('id, status, turn_number')
      .eq('venue_id', venueId)
      .eq('table_id', tableId)
      .eq('business_date', date)
      .single();
    return retry;
  }

  return created;
}

// ── Core Transition ──────────────────────────────────────────────

/**
 * Transition a table to a new state.
 * Enforces valid transitions with optimistic concurrency.
 */
export async function transitionTable(
  venueId: string,
  orgId: string,
  tableId: string,
  date: string,
  toStatus: TableState,
  actorId: string | null,
  actorType: 'user' | 'system' | 'pos_auto' = 'user',
  metadata?: {
    reservation_id?: string;
    party_size?: number;
    pos_check_id?: string;
    expected_duration?: number;
  },
): Promise<TableTransitionResult> {
  const current = await ensureTableStatus(venueId, orgId, tableId, date);
  const fromStatus = current.status as TableState;

  // Validate transition
  const validTargets = VALID_TRANSITIONS[fromStatus];
  if (!validTargets.includes(toStatus)) {
    return {
      success: false,
      table_id: tableId,
      from_status: fromStatus,
      to_status: toStatus,
      error: `Invalid transition: ${fromStatus} → ${toStatus}. Valid: ${validTargets.join(', ')}`,
    };
  }

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    status: toStatus,
    updated_at: now,
    updated_by: actorId,
  };

  if (toStatus === 'seated' || toStatus === 'reserved') {
    updatePayload.reservation_id = metadata?.reservation_id || null;
    updatePayload.party_size = metadata?.party_size || null;
  }

  if (toStatus === 'seated') {
    updatePayload.seated_at = now;
    if (metadata?.expected_duration) {
      const clearTime = new Date(Date.now() + metadata.expected_duration * 60000);
      updatePayload.expected_clear = clearTime.toISOString();
    }
  }

  if (toStatus === 'occupied') {
    updatePayload.pos_check_id = metadata?.pos_check_id || null;
  }

  if (toStatus === 'available') {
    // Clear occupant data, increment turn counter
    updatePayload.reservation_id = null;
    updatePayload.party_size = null;
    updatePayload.seated_at = null;
    updatePayload.expected_clear = null;
    updatePayload.pos_check_id = null;
    updatePayload.current_spend = 0;
    updatePayload.turn_number = current.turn_number + 1;
  }

  // Optimistic concurrency update
  const { error: updateErr } = await (supabase as any)
    .from('table_status')
    .update(updatePayload)
    .eq('id', current.id)
    .eq('status', fromStatus);

  if (updateErr) {
    return {
      success: false,
      table_id: tableId,
      from_status: fromStatus,
      to_status: toStatus,
      error: updateErr.message,
    };
  }

  // Log event
  await (supabase as any)
    .from('table_status_events')
    .insert({
      table_status_id: current.id,
      venue_id: venueId,
      table_id: tableId,
      business_date: date,
      event_type: eventTypeForTransition(toStatus),
      from_status: fromStatus,
      to_status: toStatus,
      reservation_id: metadata?.reservation_id || null,
      party_size: metadata?.party_size || null,
      pos_check_id: metadata?.pos_check_id || null,
      actor_type: actorType,
      actor_id: actorId,
    });

  return {
    success: true,
    table_id: tableId,
    from_status: fromStatus,
    to_status: toStatus,
  };
}

// ── Convenience Functions ────────────────────────────────────────

/** Reserve a table for an upcoming reservation. */
export async function reserveTable(
  venueId: string, orgId: string, tableId: string, date: string,
  reservationId: string, partySize: number, actorId: string | null,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'reserved', actorId, 'user', {
    reservation_id: reservationId,
    party_size: partySize,
  });
}

/** Seat a party at a table. */
export async function seatTable(
  venueId: string, orgId: string, tableId: string, date: string,
  reservationId: string | undefined, partySize: number,
  expectedDuration: number, actorId: string | null,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'seated', actorId, 'user', {
    reservation_id: reservationId,
    party_size: partySize,
    expected_duration: expectedDuration,
  });
}

/** Mark table as occupied (POS check opened). */
export async function markOccupied(
  venueId: string, orgId: string, tableId: string, date: string,
  posCheckId: string,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'occupied', null, 'pos_auto', {
    pos_check_id: posCheckId,
  });
}

/** Mark check dropped (POS check closed). */
export async function markCheckDropped(
  venueId: string, orgId: string, tableId: string, date: string,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'check_dropped', null, 'pos_auto');
}

/** Mark table as bussing. */
export async function markBussing(
  venueId: string, orgId: string, tableId: string, date: string,
  actorId: string | null,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'bussing', actorId, 'user');
}

/** Clear table (bussing → available). */
export async function clearTable(
  venueId: string, orgId: string, tableId: string, date: string,
  actorId: string | null,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'available', actorId, 'user');
}

/** Block a table (VIP hold, broken, etc.). */
export async function blockTable(
  venueId: string, orgId: string, tableId: string, date: string,
  actorId: string | null,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'blocked', actorId, 'user');
}

/** Unblock a table. */
export async function unblockTable(
  venueId: string, orgId: string, tableId: string, date: string,
  actorId: string | null,
): Promise<TableTransitionResult> {
  return transitionTable(venueId, orgId, tableId, date, 'available', actorId, 'user');
}

// ── POS Auto-Detection ───────────────────────────────────────────

/**
 * Update table spend from POS check data.
 * Called during POS polling to keep current_spend in sync.
 */
export async function updateTableSpend(
  venueId: string,
  tableId: string,
  date: string,
  spend: number,
): Promise<void> {
  const supabase = getServiceClient();
  await (supabase as any)
    .from('table_status')
    .update({ current_spend: spend, updated_at: new Date().toISOString() })
    .eq('venue_id', venueId)
    .eq('table_id', tableId)
    .eq('business_date', date);
}
