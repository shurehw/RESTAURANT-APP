/**
 * Rez Yield Engine — Derived Metrics
 *
 * Computes and caches metrics from table_seatings, reservations, and checks.
 * Called by the nightly ETL job.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Types ──────────────────────────────────────────────────

export interface DurationCohort {
  venue_id: string;
  party_size_bucket: string;
  section_id: string | null;
  day_of_week: number | null;
  shift_type: string | null;
  sample_size: number;
  p25_mins: number | null;
  p50_mins: number | null;
  p75_mins: number | null;
  p90_mins: number | null;
  avg_mins: number | null;
  stddev_mins: number | null;
  avg_reopen_lag: number | null;
  avg_spend: number | null;
  avg_bev_pct: number | null;
}

export interface GuestProfile {
  id: string;
  org_id: string;
  canonical_name: string | null;
  email: string | null;
  phone: string | null;
  first_seen: string;
  last_seen: string;
  visit_count: number;
  avg_spend: number;
  avg_party_size: number;
  no_show_count: number;
  cancel_count: number;
  no_show_rate: number;
  cancel_rate: number;
  preferred_times: Record<string, number>;
  preferred_venues: Record<string, number>;
  vip_tier: string;
  ltv_proxy: number;
  booking_lead_days: number | null;
}

export interface TableSeating {
  id: string;
  org_id: string;
  venue_id: string;
  reservation_id: string | null;
  table_id: string;
  business_date: string;
  shift_type: string | null;
  seated_time: string | null;
  cleared_time: string | null;
  actual_party_size: number | null;
  section_id: string | null;
  check_id: string | null;
  subtotal: number | null;
  beverage_sales: number | null;
  food_sales: number | null;
  duration_mins: number | null;
  reopen_lag_mins: number | null;
}

// ── Table Seatings Assembly ────────────────────────────────

/**
 * Assemble table_seatings for a given venue and date.
 * Joins table_status_events (seated→cleared transitions) with POS checks and reservations.
 */
export async function assembleTableSeatings(
  orgId: string,
  venueId: string,
  date: string,
): Promise<number> {
  // 1. Get all seated→X transitions from table_status_events
  const { data: events, error: evErr } = await supabase
    .from('table_status_events')
    .select('*')
    .eq('venue_id', venueId)
    .gte('occurred_at', `${date}T00:00:00`)
    .lt('occurred_at', `${date}T23:59:59`)
    .in('from_status', ['available', 'reserved'])
    .eq('to_status', 'seated')
    .order('occurred_at', { ascending: true });

  if (evErr) throw new Error(`Failed to fetch table events: ${evErr.message}`);
  if (!events || events.length === 0) return 0;

  // 2. Get clearing events (seated/occupied → bussing/available)
  const { data: clearEvents } = await supabase
    .from('table_status_events')
    .select('*')
    .eq('venue_id', venueId)
    .gte('occurred_at', `${date}T00:00:00`)
    .lt('occurred_at', `${date}T23:59:59`)
    .in('from_status', ['seated', 'occupied', 'check_dropped', 'bussing'])
    .in('to_status', ['bussing', 'available'])
    .order('occurred_at', { ascending: true });

  // 3. Get reservations for date (for linkage)
  const { data: reservations } = await supabase
    .from('reservations')
    .select('id, table_ids, party_size, arrival_time, expected_duration, first_name, last_name, email, phone')
    .eq('venue_id', venueId)
    .eq('business_date', date);

  // Build a map of table_id → clearing time
  const clearMap = new Map<string, { cleared_at: string; next_seated_at: string | null }>();
  if (clearEvents) {
    for (const ev of clearEvents) {
      const key = ev.table_id;
      if (!clearMap.has(key)) {
        clearMap.set(key, { cleared_at: ev.occurred_at, next_seated_at: null });
      }
    }
  }

  // Build reservation lookup by table_id
  const rezByTable = new Map<string, typeof reservations extends (infer T)[] | null ? T : never>();
  if (reservations) {
    for (const rez of reservations) {
      if (rez.table_ids) {
        for (const tid of rez.table_ids) {
          rezByTable.set(tid, rez);
        }
      }
    }
  }

  // 4. Assemble seatings
  const seatings: Array<Record<string, unknown>> = [];

  for (const ev of events) {
    const tableId = ev.table_id;
    const seatedAt = ev.occurred_at;

    // Find the clearing event for this table after seating
    const clearEv = clearEvents?.find(
      (c) => c.table_id === tableId && c.occurred_at > seatedAt,
    );
    const clearedAt = clearEv?.occurred_at || null;

    // Compute duration
    let durationMins: number | null = null;
    if (seatedAt && clearedAt) {
      durationMins = Math.round(
        (new Date(clearedAt).getTime() - new Date(seatedAt).getTime()) / 60000,
      );
    }

    // Find linked reservation
    const rez = rezByTable.get(tableId);

    // Determine shift type from time
    const hour = new Date(seatedAt).getHours();
    let shiftType = 'dinner';
    if (hour < 11) shiftType = 'breakfast';
    else if (hour < 15) shiftType = 'lunch';
    else if (hour >= 22) shiftType = 'late_night';

    seatings.push({
      org_id: orgId,
      venue_id: venueId,
      reservation_id: rez?.id || null,
      table_id: tableId,
      business_date: date,
      shift_type: shiftType,
      quoted_duration_mins: rez?.expected_duration || null,
      seated_time: seatedAt,
      cleared_time: clearedAt,
      actual_party_size: ev.party_size || rez?.party_size || null,
      section_id: ev.section_id || null,
      duration_mins: durationMins,
    });
  }

  if (seatings.length === 0) return 0;

  // 5. Upsert into table_seatings
  const { error: insertErr } = await supabase
    .from('table_seatings')
    .upsert(seatings, { onConflict: 'venue_id,table_id,seated_time' });

  if (insertErr) throw new Error(`Failed to insert seatings: ${insertErr.message}`);

  return seatings.length;
}

// ── Duration Cohort Computation ────────────────────────────

function partySizeBucket(size: number): string {
  if (size <= 2) return '1-2';
  if (size <= 4) return '3-4';
  if (size <= 6) return '5-6';
  if (size <= 8) return '7-8';
  return '9+';
}

/**
 * Recompute duration cohorts for a venue from historical seatings.
 * Looks back `lookbackDays` (default 90).
 */
export async function refreshDurationCohorts(
  venueId: string,
  lookbackDays = 90,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Fetch all seatings with valid duration
  const { data: seatings, error } = await supabase
    .from('table_seatings')
    .select('actual_party_size, section_id, shift_type, business_date, duration_mins, reopen_lag_mins, subtotal, beverage_sales, food_sales')
    .eq('venue_id', venueId)
    .gte('business_date', cutoffStr)
    .not('duration_mins', 'is', null)
    .gt('duration_mins', 0)
    .lt('duration_mins', 480); // exclude outliers > 8 hours

  if (error) throw new Error(`Failed to fetch seatings for cohorts: ${error.message}`);
  if (!seatings || seatings.length === 0) return 0;

  // Group by (party_size_bucket, section_id, day_of_week, shift_type)
  const groups = new Map<string, number[]>();
  const groupMeta = new Map<string, {
    section_id: string | null;
    day_of_week: number | null;
    shift_type: string | null;
    party_size_bucket: string;
    reopens: number[];
    spends: number[];
    bev_pcts: number[];
  }>();

  for (const s of seatings) {
    const bucket = partySizeBucket(s.actual_party_size || 2);
    const dow = new Date(s.business_date).getDay();

    // Venue-wide cohort (all sections, all days)
    const keyWide = `${bucket}|null|null|null`;
    if (!groups.has(keyWide)) {
      groups.set(keyWide, []);
      groupMeta.set(keyWide, { section_id: null, day_of_week: null, shift_type: null, party_size_bucket: bucket, reopens: [], spends: [], bev_pcts: [] });
    }
    groups.get(keyWide)!.push(s.duration_mins);

    const meta = groupMeta.get(keyWide)!;
    if (s.reopen_lag_mins != null) meta.reopens.push(s.reopen_lag_mins);
    if (s.subtotal != null) meta.spends.push(s.subtotal);
    if (s.subtotal && s.beverage_sales) meta.bev_pcts.push((s.beverage_sales / s.subtotal) * 100);

    // DOW-specific cohort
    const keyDow = `${bucket}|null|${dow}|null`;
    if (!groups.has(keyDow)) {
      groups.set(keyDow, []);
      groupMeta.set(keyDow, { section_id: null, day_of_week: dow, shift_type: null, party_size_bucket: bucket, reopens: [], spends: [], bev_pcts: [] });
    }
    groups.get(keyDow)!.push(s.duration_mins);

    // Section-specific cohort
    if (s.section_id) {
      const keySec = `${bucket}|${s.section_id}|null|null`;
      if (!groups.has(keySec)) {
        groups.set(keySec, []);
        groupMeta.set(keySec, { section_id: s.section_id, day_of_week: null, shift_type: null, party_size_bucket: bucket, reopens: [], spends: [], bev_pcts: [] });
      }
      groups.get(keySec)!.push(s.duration_mins);
    }

    // Shift-specific cohort
    if (s.shift_type) {
      const keyShift = `${bucket}|null|null|${s.shift_type}`;
      if (!groups.has(keyShift)) {
        groups.set(keyShift, []);
        groupMeta.set(keyShift, { section_id: null, day_of_week: null, shift_type: s.shift_type, party_size_bucket: bucket, reopens: [], spends: [], bev_pcts: [] });
      }
      groups.get(keyShift)!.push(s.duration_mins);
    }
  }

  // Compute percentiles for each group
  const cohorts: Array<Record<string, unknown>> = [];

  for (const [key, durations] of groups) {
    if (durations.length < 3) continue; // need minimum sample

    const meta = groupMeta.get(key)!;
    const sorted = durations.slice().sort((a, b) => a - b);
    const n = sorted.length;

    const p = (pct: number) => sorted[Math.min(Math.floor(pct * n), n - 1)];
    const avg = sorted.reduce((a, b) => a + b, 0) / n;
    const variance = sorted.reduce((a, b) => a + (b - avg) ** 2, 0) / n;

    cohorts.push({
      venue_id: venueId,
      party_size_bucket: meta.party_size_bucket,
      section_id: meta.section_id,
      day_of_week: meta.day_of_week,
      shift_type: meta.shift_type,
      sample_size: n,
      p25_mins: p(0.25),
      p50_mins: p(0.5),
      p75_mins: p(0.75),
      p90_mins: p(0.9),
      avg_mins: Math.round(avg * 10) / 10,
      stddev_mins: Math.round(Math.sqrt(variance) * 10) / 10,
      avg_reopen_lag: meta.reopens.length > 0
        ? Math.round((meta.reopens.reduce((a, b) => a + b, 0) / meta.reopens.length) * 10) / 10
        : null,
      avg_spend: meta.spends.length > 0
        ? Math.round((meta.spends.reduce((a, b) => a + b, 0) / meta.spends.length) * 100) / 100
        : null,
      avg_bev_pct: meta.bev_pcts.length > 0
        ? Math.round((meta.bev_pcts.reduce((a, b) => a + b, 0) / meta.bev_pcts.length) * 100) / 100
        : null,
      updated_at: new Date().toISOString(),
    });
  }

  if (cohorts.length === 0) return 0;

  // Upsert cohorts
  const { error: upsertErr } = await supabase
    .from('duration_cohorts')
    .upsert(cohorts, {
      onConflict: 'venue_id,party_size_bucket,section_id,day_of_week,shift_type',
    });

  if (upsertErr) throw new Error(`Failed to upsert cohorts: ${upsertErr.message}`);
  return cohorts.length;
}

// ── Guest Profile Assembly ─────────────────────────────────

/**
 * Refresh guest profiles for an org from reservation history.
 */
export async function refreshGuestProfiles(orgId: string): Promise<number> {
  // Fetch all reservations with guest info
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('id, venue_id, email, phone, first_name, last_name, party_size, business_date, status, channel, actual_spend, booked_at, arrival_time, is_vip')
    .eq('org_id', orgId)
    .not('status', 'eq', 'cancelled')
    .order('business_date', { ascending: true });

  if (error) throw new Error(`Failed to fetch reservations for profiles: ${error.message}`);
  if (!reservations || reservations.length === 0) return 0;

  // Group by guest identity (email first, then phone)
  const guestMap = new Map<string, {
    email: string | null;
    phone: string | null;
    name: string;
    visits: Array<{
      date: string;
      venue_id: string;
      status: string;
      spend: number | null;
      party_size: number;
      time: string;
      lead_days: number | null;
      is_vip: boolean;
    }>;
  }>();

  for (const r of reservations) {
    const key = r.email || r.phone || `${r.first_name}_${r.last_name}`.toLowerCase();
    if (!key || key === '_') continue;

    if (!guestMap.has(key)) {
      guestMap.set(key, {
        email: r.email || null,
        phone: r.phone || null,
        name: `${r.first_name} ${r.last_name}`.trim(),
        visits: [],
      });
    }

    // Compute booking lead time
    let leadDays: number | null = null;
    if (r.booked_at && r.business_date) {
      const bookedDate = new Date(r.booked_at);
      const serviceDate = new Date(r.business_date);
      leadDays = Math.round((serviceDate.getTime() - bookedDate.getTime()) / 86400000);
    }

    guestMap.get(key)!.visits.push({
      date: r.business_date,
      venue_id: r.venue_id,
      status: r.status,
      spend: r.actual_spend,
      party_size: r.party_size,
      time: r.arrival_time,
      lead_days: leadDays,
      is_vip: r.is_vip,
    });
  }

  // Build profiles
  const profiles: Array<Record<string, unknown>> = [];

  for (const [, guest] of guestMap) {
    const visits = guest.visits;
    const completedVisits = visits.filter((v) => v.status === 'completed' || v.status === 'seated');
    const noShows = visits.filter((v) => v.status === 'no_show').length;
    const cancels = visits.filter((v) => v.status === 'cancelled').length;
    const total = visits.length;

    const spends = completedVisits.filter((v) => v.spend != null).map((v) => v.spend!);
    const parties = visits.map((v) => v.party_size);
    const leadDays = visits.filter((v) => v.lead_days != null).map((v) => v.lead_days!);

    // Preferred times frequency
    const timeCounts: Record<string, number> = {};
    for (const v of visits) {
      const t = v.time?.substring(0, 5) || 'unknown';
      timeCounts[t] = (timeCounts[t] || 0) + 1;
    }

    // Preferred venues frequency
    const venueCounts: Record<string, number> = {};
    for (const v of visits) {
      venueCounts[v.venue_id] = (venueCounts[v.venue_id] || 0) + 1;
    }

    // VIP tier
    const isVip = visits.some((v) => v.is_vip);
    const avgSpend = spends.length > 0 ? spends.reduce((a, b) => a + b, 0) / spends.length : 0;
    let tier = 'standard';
    if (isVip || avgSpend > 500 || completedVisits.length > 10) tier = 'platinum';
    else if (avgSpend > 300 || completedVisits.length > 5) tier = 'gold';
    else if (avgSpend > 150 || completedVisits.length > 2) tier = 'silver';

    profiles.push({
      org_id: orgId,
      canonical_name: guest.name || null,
      email: guest.email,
      phone: guest.phone,
      first_seen: visits[0]?.date || null,
      last_seen: visits[visits.length - 1]?.date || null,
      visit_count: completedVisits.length,
      avg_spend: spends.length > 0 ? Math.round(avgSpend * 100) / 100 : 0,
      avg_party_size: parties.length > 0
        ? Math.round((parties.reduce((a, b) => a + b, 0) / parties.length) * 10) / 10
        : 0,
      no_show_count: noShows,
      cancel_count: cancels,
      no_show_rate: total > 0 ? Math.round((noShows / total) * 10000) / 10000 : 0,
      cancel_rate: total > 0 ? Math.round((cancels / total) * 10000) / 10000 : 0,
      preferred_times: timeCounts,
      preferred_venues: venueCounts,
      vip_tier: tier,
      ltv_proxy: Math.round(avgSpend * completedVisits.length * 100) / 100,
      booking_lead_days: leadDays.length > 0
        ? Math.round((leadDays.reduce((a, b) => a + b, 0) / leadDays.length) * 10) / 10
        : null,
      updated_at: new Date().toISOString(),
    });
  }

  if (profiles.length === 0) return 0;

  // Upsert in batches to avoid N+1 round trips.
  const upsertByEmail = profiles.filter((p) => Boolean(p.email));
  const upsertByPhone = profiles.filter((p) => !p.email && Boolean(p.phone));
  const batchSize = 500;

  let upserted = 0;

  for (let i = 0; i < upsertByEmail.length; i += batchSize) {
    const batch = upsertByEmail.slice(i, i + batchSize);
    const { error: err } = await supabase
      .from('guest_profiles')
      .upsert(batch, {
        onConflict: 'org_id,email',
        ignoreDuplicates: false,
      });
    if (err) throw new Error(`Failed to upsert guest profiles by email: ${err.message}`);
    upserted += batch.length;
  }

  for (let i = 0; i < upsertByPhone.length; i += batchSize) {
    const batch = upsertByPhone.slice(i, i + batchSize);
    const { error: err } = await supabase
      .from('guest_profiles')
      .upsert(batch, {
        onConflict: 'org_id,phone',
        ignoreDuplicates: false,
      });
    if (err) throw new Error(`Failed to upsert guest profiles by phone: ${err.message}`);
    upserted += batch.length;
  }

  return upserted;
}

// ── Demand Metrics ─────────────────────────────────────────

export interface SlotDemandMetric {
  slot: string;        // "17:00", "17:15", etc.
  total_requests: number;
  accepted: number;
  denied: number;
  denial_rate: number;
  avg_party_size: number;
  waitlisted: number;
}

/**
 * Get demand funnel metrics for a venue/date from reservation_requests.
 */
export async function getSlotDemandMetrics(
  venueId: string,
  date: string,
): Promise<SlotDemandMetric[]> {
  const { data, error } = await supabase
    .from('reservation_requests')
    .select('requested_time, requested_party_size, was_accepted, waitlisted')
    .eq('venue_id', venueId)
    .eq('requested_date', date);

  if (error) throw new Error(`Failed to fetch demand: ${error.message}`);
  if (!data || data.length === 0) return [];

  // Group by 15-minute slot
  const slots = new Map<string, { requests: number; accepted: number; denied: number; parties: number[]; waitlisted: number }>();

  for (const r of data) {
    // Round to 15-minute slot
    const [h, m] = r.requested_time.split(':').map(Number);
    const slotMin = Math.floor(m / 15) * 15;
    const slot = `${String(h).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;

    if (!slots.has(slot)) {
      slots.set(slot, { requests: 0, accepted: 0, denied: 0, parties: [], waitlisted: 0 });
    }
    const s = slots.get(slot)!;
    s.requests++;
    if (r.was_accepted) s.accepted++;
    else s.denied++;
    s.parties.push(r.requested_party_size);
    if (r.waitlisted) s.waitlisted++;
  }

  return Array.from(slots.entries())
    .map(([slot, s]) => ({
      slot,
      total_requests: s.requests,
      accepted: s.accepted,
      denied: s.denied,
      denial_rate: s.requests > 0 ? Math.round((s.denied / s.requests) * 1000) / 1000 : 0,
      avg_party_size: s.parties.length > 0
        ? Math.round((s.parties.reduce((a, b) => a + b, 0) / s.parties.length) * 10) / 10
        : 0,
      waitlisted: s.waitlisted,
    }))
    .sort((a, b) => a.slot.localeCompare(b.slot));
}

// ── Pickup Pace ────────────────────────────────────────────

export interface PickupPacePoint {
  hours_out: number;
  covers_booked: number;
  historical_avg: number;
  pace_ratio: number;     // current / historical (>1 = ahead of pace)
}

/**
 * Compare current booking pace vs historical average.
 * Uses reservation_snapshots for historical baseline.
 */
export async function getPickupPace(
  venueId: string,
  date: string,
): Promise<PickupPacePoint[]> {
  // Get current book
  const { data: currentRezs, error: rezErr } = await supabase
    .from('reservations')
    .select('id, party_size, booked_at, status')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .not('status', 'in', '("cancelled","no_show")');

  if (rezErr) throw new Error(`Failed to fetch reservations: ${rezErr.message}`);

  const currentCovers = (currentRezs || []).reduce((sum, r) => sum + r.party_size, 0);

  // Get historical snapshots for same DOW
  const dow = new Date(date).getDay();
  const cutoff = new Date(date);
  cutoff.setDate(cutoff.getDate() - 90);

  const { data: snapshots } = await supabase
    .from('reservation_snapshots')
    .select('business_date, hours_to_service, confirmed_covers, actual_covers')
    .eq('venue_id', venueId)
    .gte('business_date', cutoff.toISOString().split('T')[0])
    .lt('business_date', date);

  // Filter to same DOW
  const sameDow = (snapshots || []).filter(
    (s) => new Date(s.business_date).getDay() === dow,
  );

  // Group by hours_to_service
  const byHours = new Map<number, number[]>();
  for (const s of sameDow) {
    const h = Math.round(s.hours_to_service);
    if (!byHours.has(h)) byHours.set(h, []);
    byHours.get(h)!.push(s.confirmed_covers);
  }

  // Compute pace points
  const now = new Date();
  const serviceStart = new Date(`${date}T17:00:00`); // approximate
  const hoursOut = Math.max(0, (serviceStart.getTime() - now.getTime()) / 3600000);

  const points: PickupPacePoint[] = [];
  for (const [h, covers] of byHours) {
    const avg = covers.reduce((a, b) => a + b, 0) / covers.length;
    points.push({
      hours_out: h,
      covers_booked: h <= hoursOut ? currentCovers : 0,
      historical_avg: Math.round(avg),
      pace_ratio: avg > 0 ? Math.round((currentCovers / avg) * 100) / 100 : 0,
    });
  }

  return points.sort((a, b) => b.hours_out - a.hours_out);
}

// ── Duration Cohort Lookup ─────────────────────────────────

/**
 * Look up predicted duration for a specific party size / context.
 * Returns the best-matching cohort with fallback chain.
 */
export async function predictDuration(
  venueId: string,
  partySize: number,
  sectionId?: string,
  dayOfWeek?: number,
  shiftType?: string,
): Promise<{
  p25: number; p50: number; p75: number; p90: number;
  avg: number; sample_size: number; source: string;
} | null> {
  const bucket = partySizeBucket(partySize);

  // Try specific → general fallback chain
  const queries = [
    // Most specific: party_size + section + DOW + shift
    { party_size_bucket: bucket, section_id: sectionId || null, day_of_week: dayOfWeek ?? null, shift_type: shiftType || null },
    // Party_size + DOW
    { party_size_bucket: bucket, section_id: null, day_of_week: dayOfWeek ?? null, shift_type: null },
    // Party_size + section
    { party_size_bucket: bucket, section_id: sectionId || null, day_of_week: null, shift_type: null },
    // Party_size only (venue-wide)
    { party_size_bucket: bucket, section_id: null, day_of_week: null, shift_type: null },
  ];

  for (const q of queries) {
    let query = supabase
      .from('duration_cohorts')
      .select('*')
      .eq('venue_id', venueId)
      .eq('party_size_bucket', q.party_size_bucket);

    if (q.section_id) query = query.eq('section_id', q.section_id);
    else query = query.is('section_id', null);

    if (q.day_of_week != null) query = query.eq('day_of_week', q.day_of_week);
    else query = query.is('day_of_week', null);

    if (q.shift_type) query = query.eq('shift_type', q.shift_type);
    else query = query.is('shift_type', null);

    const { data } = await query.maybeSingle();

    if (data && data.sample_size >= 3) {
      return {
        p25: data.p25_mins,
        p50: data.p50_mins,
        p75: data.p75_mins,
        p90: data.p90_mins,
        avg: data.avg_mins,
        sample_size: data.sample_size,
        source: `${q.party_size_bucket}|${q.section_id || 'all'}|${q.day_of_week ?? 'all'}|${q.shift_type || 'all'}`,
      };
    }
  }

  return null;
}
