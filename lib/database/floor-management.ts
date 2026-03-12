/**
 * lib/database/floor-management.ts
 * Data access layer for live floor management: table status, waitlist, and floor intelligence.
 * Pattern: lib/database/floor-plan.ts
 */

import { getServiceClient } from '@/lib/supabase/service';
import type { TableState } from '@/lib/floor-management/table-state-machine';

// ── Types ────────────────────────────────────────────────────────

export interface TableStatus {
  id: string;
  org_id: string;
  venue_id: string;
  table_id: string;
  business_date: string;
  status: TableState;
  reservation_id: string | null;
  party_size: number | null;
  seated_at: string | null;
  expected_clear: string | null;
  pos_check_id: string | null;
  current_spend: number;
  turn_number: number;
  updated_at: string;
  updated_by: string | null;
}

export interface TableStatusWithDetails extends TableStatus {
  table_number: string;
  section_id: string | null;
  min_capacity: number;
  max_capacity: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
  guest_name?: string;
}

export interface WaitlistEntry {
  id: string;
  org_id: string;
  venue_id: string;
  business_date: string;
  guest_name: string;
  party_size: number;
  phone: string | null;
  added_at: string;
  estimated_wait: number | null;
  quoted_wait: number | null;
  status: WaitlistStatus;
  seated_at: string | null;
  reservation_id: string | null;
  notes: string | null;
  seating_preference: string | null;
  created_at: string;
  updated_at: string;
}

export type WaitlistStatus = 'waiting' | 'notified' | 'seated' | 'left' | 'cancelled';

export interface LiveFloorSummary {
  total_tables: number;
  available: number;
  reserved: number;
  seated: number;
  occupied: number;
  check_dropped: number;
  bussing: number;
  blocked: number;
  total_covers: number;
  total_revenue: number;
  total_turns: number;
  avg_turn_minutes: number;
  waitlist_count: number;
}

export interface TableStatusEvent {
  id: string;
  table_status_id: string;
  venue_id: string;
  table_id: string;
  business_date: string;
  event_type: string;
  from_status: string | null;
  to_status: string;
  reservation_id: string | null;
  party_size: number | null;
  pos_check_id: string | null;
  actor_type: string;
  actor_id: string | null;
  occurred_at: string;
}

// ── Table Status Queries ────────────────────────────────────────

/**
 * Get all table statuses for a venue/date, joined with table info.
 * Creates 'available' rows for tables that don't have a status row yet.
 */
export async function getTableStatusForVenue(
  venueId: string,
  date: string,
): Promise<TableStatusWithDetails[]> {
  const supabase = getServiceClient();

  // Fetch all active tables
  const { data: tables } = await (supabase as any)
    .from('venue_tables')
    .select('id, table_number, section_id, min_capacity, max_capacity, shape, pos_x, pos_y, width, height, rotation')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (!tables || tables.length === 0) return [];

  // Fetch existing status rows for this date
  const { data: statuses } = await (supabase as any)
    .from('table_status')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date);

  const statusMap = new Map<string, TableStatus>();
  for (const s of statuses || []) {
    statusMap.set(s.table_id, s);
  }

  // Fetch reservation guest names for seated/reserved tables
  const rezIds = (statuses || [])
    .filter((s: any) => s.reservation_id)
    .map((s: any) => s.reservation_id);

  const rezNameMap = new Map<string, string>();
  if (rezIds.length > 0) {
    const { data: rezs } = await (supabase as any)
      .from('reservations')
      .select('id, first_name, last_name')
      .in('id', rezIds);

    for (const r of rezs || []) {
      rezNameMap.set(r.id, `${r.first_name} ${r.last_name}`.trim());
    }
  }

  // Merge tables with statuses
  return tables.map((t: any) => {
    const status = statusMap.get(t.id);
    return {
      id: status?.id || '',
      org_id: status?.org_id || '',
      venue_id: venueId,
      table_id: t.id,
      business_date: date,
      status: (status?.status || 'available') as TableState,
      reservation_id: status?.reservation_id || null,
      party_size: status?.party_size || null,
      seated_at: status?.seated_at || null,
      expected_clear: status?.expected_clear || null,
      pos_check_id: status?.pos_check_id || null,
      current_spend: status?.current_spend || 0,
      turn_number: status?.turn_number || 0,
      updated_at: status?.updated_at || '',
      updated_by: status?.updated_by || null,
      // Table details
      table_number: t.table_number,
      section_id: t.section_id,
      min_capacity: t.min_capacity,
      max_capacity: t.max_capacity,
      shape: t.shape,
      pos_x: t.pos_x,
      pos_y: t.pos_y,
      width: t.width,
      height: t.height,
      rotation: t.rotation,
      // Guest name from reservation
      guest_name: status?.reservation_id
        ? rezNameMap.get(status.reservation_id) || undefined
        : undefined,
    };
  });
}

/**
 * Get live floor summary — aggregate counts, covers, revenue, turn stats.
 */
export async function getLiveFloorSummary(
  venueId: string,
  date: string,
): Promise<LiveFloorSummary> {
  const supabase = getServiceClient();

  // Get table count
  const { count: totalTables } = await (supabase as any)
    .from('venue_tables')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('is_active', true);

  // Get status counts
  const { data: statuses } = await (supabase as any)
    .from('table_status')
    .select('status, party_size, current_spend, turn_number')
    .eq('venue_id', venueId)
    .eq('business_date', date);

  const counts: Record<TableState, number> = {
    available: 0,
    reserved: 0,
    seated: 0,
    occupied: 0,
    check_dropped: 0,
    bussing: 0,
    blocked: 0,
  };
  let totalCovers = 0;
  let totalRevenue = 0;
  let totalTurns = 0;

  for (const s of statuses || []) {
    const state = s.status as TableState;
    if (counts[state] !== undefined) counts[state]++;
    if (s.party_size && ['seated', 'occupied', 'check_dropped'].includes(state)) {
      totalCovers += s.party_size;
    }
    totalRevenue += Number(s.current_spend) || 0;
    totalTurns += s.turn_number || 0;
  }

  // Tables without a status row are available
  const statusCount = statuses?.length || 0;
  counts.available += Math.max(0, (totalTables || 0) - statusCount);

  // Compute avg turn time from today's events
  const { data: turnEvents } = await (supabase as any)
    .from('table_status_events')
    .select('table_id, event_type, occurred_at')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .in('event_type', ['seated', 'cleared'])
    .order('occurred_at', { ascending: true });

  let avgTurnMinutes = 0;
  if (turnEvents && turnEvents.length > 1) {
    // Match seated→cleared pairs per table
    const tableSeats = new Map<string, string>();
    const turnDurations: number[] = [];

    for (const ev of turnEvents) {
      if (ev.event_type === 'seated') {
        tableSeats.set(ev.table_id, ev.occurred_at);
      } else if (ev.event_type === 'cleared') {
        const seatedAt = tableSeats.get(ev.table_id);
        if (seatedAt) {
          const mins = (new Date(ev.occurred_at).getTime() - new Date(seatedAt).getTime()) / 60000;
          if (mins > 0 && mins < 480) turnDurations.push(mins);
          tableSeats.delete(ev.table_id);
        }
      }
    }

    if (turnDurations.length > 0) {
      avgTurnMinutes = Math.round(
        turnDurations.reduce((s, d) => s + d, 0) / turnDurations.length,
      );
    }
  }

  // Waitlist count
  const { count: waitlistCount } = await (supabase as any)
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .in('status', ['waiting', 'notified']);

  return {
    total_tables: totalTables || 0,
    available: counts.available,
    reserved: counts.reserved,
    seated: counts.seated,
    occupied: counts.occupied,
    check_dropped: counts.check_dropped,
    bussing: counts.bussing,
    blocked: counts.blocked,
    total_covers: totalCovers,
    total_revenue: totalRevenue,
    total_turns: totalTurns,
    avg_turn_minutes: avgTurnMinutes,
    waitlist_count: waitlistCount || 0,
  };
}

// ── Waitlist ─────────────────────────────────────────────────────

/**
 * Add a party to the waitlist.
 */
export async function addToWaitlist(
  orgId: string,
  venueId: string,
  data: {
    guest_name: string;
    party_size: number;
    phone?: string;
    business_date: string;
    quoted_wait?: number;
    notes?: string;
    seating_preference?: string;
  },
): Promise<WaitlistEntry> {
  const supabase = getServiceClient();

  // Estimate wait based on current floor state
  const estimatedWait = await estimateWait(venueId, data.business_date, data.party_size);

  const { data: entry, error } = await (supabase as any)
    .from('waitlist_entries')
    .insert({
      org_id: orgId,
      venue_id: venueId,
      business_date: data.business_date,
      guest_name: data.guest_name,
      party_size: data.party_size,
      phone: data.phone || null,
      quoted_wait: data.quoted_wait ?? estimatedWait,
      estimated_wait: estimatedWait,
      notes: data.notes || null,
      seating_preference: data.seating_preference || null,
    })
    .select()
    .single();

  if (error) throw error;
  return entry;
}

/**
 * Get active waitlist entries (waiting + notified), ordered by added_at.
 */
export async function getActiveWaitlist(
  venueId: string,
  date: string,
): Promise<WaitlistEntry[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('waitlist_entries')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .in('status', ['waiting', 'notified'])
    .order('added_at', { ascending: true });

  if (error) {
    console.error('[floor-mgmt] Failed to fetch waitlist:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Update waitlist entry status.
 */
export async function updateWaitlistEntry(
  entryId: string,
  updates: Partial<Pick<WaitlistEntry, 'status' | 'seated_at' | 'reservation_id' | 'quoted_wait' | 'notes'>>,
): Promise<WaitlistEntry> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('waitlist_entries')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Estimate wait time for a party based on current floor state.
 * Uses occupied tables' expected_clear times and turn history.
 */
export async function estimateWait(
  venueId: string,
  date: string,
  partySize: number,
): Promise<number> {
  const supabase = getServiceClient();

  // Find tables that can fit this party and are currently occupied
  const { data: tables } = await (supabase as any)
    .from('venue_tables')
    .select('id, max_capacity')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .gte('max_capacity', partySize);

  if (!tables || tables.length === 0) return 60; // No suitable tables

  const suitableIds = tables.map((t: any) => t.id);

  // Check which suitable tables are occupied and when they might clear
  const { data: occupiedStatuses } = await (supabase as any)
    .from('table_status')
    .select('table_id, status, seated_at, expected_clear')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .in('table_id', suitableIds)
    .in('status', ['seated', 'occupied', 'check_dropped', 'bussing']);

  // If any suitable table is available, wait is 0
  const occupiedIds = new Set((occupiedStatuses || []).map((s: any) => s.table_id));
  const availableCount = suitableIds.filter((id: string) => !occupiedIds.has(id)).length;
  if (availableCount > 0) return 0;

  // Estimate from expected_clear or seated_at + avg turn time
  const now = Date.now();
  const clearTimes: number[] = [];

  for (const s of occupiedStatuses || []) {
    if (s.expected_clear) {
      const clearMs = new Date(s.expected_clear).getTime() - now;
      if (clearMs > 0) clearTimes.push(clearMs / 60000);
    } else if (s.seated_at) {
      // Assume 90min turn if no expected_clear
      const elapsed = (now - new Date(s.seated_at).getTime()) / 60000;
      const remaining = Math.max(0, 90 - elapsed);
      clearTimes.push(remaining);
    }
  }

  if (clearTimes.length === 0) return 30; // Default estimate

  // Wait = soonest table to clear + 5min buffer for bussing
  clearTimes.sort((a, b) => a - b);
  return Math.round(clearTimes[0] + 5);
}

// ── Table Assignment Intelligence ────────────────────────────────

/**
 * Find the best table(s) for a party based on:
 * - Capacity fit (prefer closest match to avoid wasting large tables)
 * - Section balance (prefer sections with fewer occupied tables)
 * - Seating preference matching
 */
export async function findBestTableForParty(
  venueId: string,
  date: string,
  partySize: number,
  preferences?: {
    section_id?: string;
    seating_preference?: string;
  },
): Promise<{ table_id: string; table_number: string; section_id: string | null; score: number }[]> {
  const supabase = getServiceClient();

  // Get all available tables that fit the party
  const { data: tables } = await (supabase as any)
    .from('venue_tables')
    .select('id, table_number, section_id, min_capacity, max_capacity, shape')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .gte('max_capacity', partySize)
    .lte('min_capacity', partySize);

  if (!tables || tables.length === 0) {
    // Relax min_capacity constraint
    const { data: relaxed } = await (supabase as any)
      .from('venue_tables')
      .select('id, table_number, section_id, min_capacity, max_capacity, shape')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .gte('max_capacity', partySize);

    if (!relaxed || relaxed.length === 0) return [];
    return scoreAndRank(relaxed, venueId, date, partySize, preferences);
  }

  return scoreAndRank(tables, venueId, date, partySize, preferences);
}

async function scoreAndRank(
  tables: any[],
  venueId: string,
  date: string,
  partySize: number,
  preferences?: { section_id?: string; seating_preference?: string },
): Promise<{ table_id: string; table_number: string; section_id: string | null; score: number }[]> {
  const supabase = getServiceClient();
  const tableIds = tables.map((t: any) => t.id);

  // Check which tables are currently available (no status row or status = 'available')
  const { data: statuses } = await (supabase as any)
    .from('table_status')
    .select('table_id, status')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .in('table_id', tableIds);

  const occupiedSet = new Set<string>();
  for (const s of statuses || []) {
    if (s.status !== 'available') occupiedSet.add(s.table_id);
  }

  // Get section occupancy for balancing
  const { data: allStatuses } = await (supabase as any)
    .from('table_status')
    .select('table_id')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .in('status', ['seated', 'occupied', 'check_dropped']);

  // Map table_id → section_id for occupancy counting
  const { data: allTables } = await (supabase as any)
    .from('venue_tables')
    .select('id, section_id')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  const tableToSection = new Map<string, string>();
  for (const t of allTables || []) {
    if (t.section_id) tableToSection.set(t.id, t.section_id);
  }

  const sectionOccupancy = new Map<string, number>();
  for (const s of allStatuses || []) {
    const sec = tableToSection.get(s.table_id);
    if (sec) sectionOccupancy.set(sec, (sectionOccupancy.get(sec) || 0) + 1);
  }

  // Score each available table
  const scored = tables
    .filter((t: any) => !occupiedSet.has(t.id))
    .map((t: any) => {
      let score = 100;

      // Capacity fit: prefer closest match (penalty for wasted seats)
      const wastedSeats = t.max_capacity - partySize;
      score -= wastedSeats * 10;

      // Section balance: prefer less-occupied sections
      const secOcc = sectionOccupancy.get(t.section_id) || 0;
      score -= secOcc * 5;

      // Section preference: bonus for matching requested section
      if (preferences?.section_id && t.section_id === preferences.section_id) {
        score += 30;
      }

      // Seating preference: bonus for matching shape preferences
      if (preferences?.seating_preference) {
        const pref = preferences.seating_preference.toLowerCase();
        if (pref.includes('booth') && t.shape === 'booth') score += 20;
        if (pref.includes('bar') && t.shape === 'bar_seat') score += 20;
        if (pref.includes('round') && t.shape === 'round') score += 15;
        if (pref.includes('patio') && t.shape === 'rectangle') score += 10;
      }

      return {
        table_id: t.id,
        table_number: t.table_number,
        section_id: t.section_id,
        score,
      };
    });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

// ── Event Queries ────────────────────────────────────────────────

/**
 * Get recent table events for a venue/date (for timeline / audit).
 */
export async function getTableEvents(
  venueId: string,
  date: string,
  limit = 50,
): Promise<TableStatusEvent[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('table_status_events')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[floor-mgmt] Failed to fetch table events:', error.message);
    return [];
  }
  return data || [];
}
