/**
 * SevenRooms API Client
 *
 * Read-only. Supports:
 *  - Token auth (form-encoded POST, ~12hr expiry)
 *  - Shift schedule fetch (authoritative turn times + pacing)
 *  - Reservation export (full data with pos_tickets, served_by, etc.)
 *
 * Auth: POST /2_4/auth with form-encoded client_id + client_secret
 * Base: https://api.sevenrooms.com/2_4
 */

const BASE_URL = 'https://api.sevenrooms.com/2_4';
const REQUEST_TIMEOUT_MS = 15_000;

// ══════════════════════════════════════════════════════════════════════════
// VENUE MAPPING
// KevaOS venue_id → SevenRooms venue_id
//
// SR venue IDs confirmed from TipSee full_reservations.venue_id and
// the H.wood codebase. These are stable identifiers, not secrets.
//
// Master venue group ID (covers all venues):
//   ahNzfnNldmVucm9vbXMtc2VjdXJlciELEhRuaWdodGxvb3BfVmVudWVHcm91cBiAgNCSitabCgw
//
// CURRENT STATE: Group-wide credentials active — all venues below return 200.
// ══════════════════════════════════════════════════════════════════════════

export const SEVENROOMS_VENUE_MAP: Record<string, string> = {
  // Delilah Dallas
  '79c33e6a-eb21-419f-9606-7494d1a9584c': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDl173FzggM',
  // Delilah LA
  '11111111-1111-1111-1111-111111111111': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDQwPySzgkM',
  // Delilah Miami
  '288b7f22-ffdc-4701-a396-a6b415aff0f1': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDC-ILN_goM',
  // The Nice Guy LA
  '22222222-2222-2222-2222-222222222222': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDQkpbjtwoM',
  // Harriet's West Hollywood
  '98be7b04-918e-4e08-8d7a-fce8fe854d3c': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgICw_9Xx_wsM',
  // Bird Streets Club - Dining
  'a7da18a4-a70b-4492-abed-c9fed5851c9e': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDk8dXFiQgM',
  // Keys Los Angeles
  'f9fb757b-e2dc-4c16-835d-9de80f983073': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgIDGrbuAtgoM',
  // Poppy
  'a2f9d28d-8dde-4b57-8013-2c94602fe078': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgICwjq347ggM',
  // Didi Events
  'c6776476-44c5-454b-9765-29f3737e3776': 'ahNzfnNldmVucm9vbXMtc2VjdXJlchwLEg9uaWdodGxvb3BfVmVudWUYgICwmejqsgoM',
  // Bootsy Bellows (no KevaOS venue UUID yet — add when onboarded)
  // SR: ahNzfnNldmVucm9vbXMtc2VjdXJlchcLEg9uaWdodGxvb3BfVmVudWUY-Nt3DA
};

// ══════════════════════════════════════════════════════════════════════════
// WIDGET SLUG MAP
// KevaOS venue_id → SevenRooms widget slug (used by public widget API)
//
// The public widget API (api-yoa/availability/widget/range) uses venue slugs
// and requires NO authentication. It returns richer data than the authenticated
// API including per-access-rule pacing, covers remaining, seating areas, etc.
// ══════════════════════════════════════════════════════════════════════════

export const SEVENROOMS_SLUG_MAP: Record<string, string> = {
  // Delilah Dallas
  '79c33e6a-eb21-419f-9606-7494d1a9584c': 'delilahrestaurantdallas',
  // Delilah LA
  '11111111-1111-1111-1111-111111111111': 'delilahla',
  // Delilah Miami
  '288b7f22-ffdc-4701-a396-a6b415aff0f1': 'delilahmiami',
  // The Nice Guy LA
  '22222222-2222-2222-2222-222222222222': 'theniceguy',
  // Harriet's West Hollywood
  '98be7b04-918e-4e08-8d7a-fce8fe854d3c': 'harrietsweho',
  // Bird Streets Club
  'a7da18a4-a70b-4492-abed-c9fed5851c9e': 'birdstreetsclub',
  // Keys Los Angeles
  'f9fb757b-e2dc-4c16-835d-9de80f983073': 'keyslosangeles',
  // Poppy
  'a2f9d28d-8dde-4b57-8013-2c94602fe078': 'poppynightclub',
  // Bootsy Bellows
  // SR slug: 'bootsybellows'
};

// Module-level cache: KevaOS venue_id → resolved SR venue_id (survives warm invocations)
const srVenueIdCache = new Map<string, string>();

/**
 * Expose cache setter so callers (e.g. API routes) can seed it after
 * auto-discovering a venue's SR ID via TipSee.
 */
export function cacheSrVenueId(kevaVenueId: string, srVenueId: string): void {
  srVenueIdCache.set(kevaVenueId, srVenueId);
}

/**
 * Resolve the SevenRooms venue_id for an KevaOS venue.
 *
 * Priority:
 *   1. SEVENROOMS_VENUE_MAP static entries (env var configured)
 *   2. Module-level runtime cache (previous discovery this cold start)
 *
 * Returns '' if no SR venue found (caller should fall back to TipSee).
 * Callers can enrich with TipSee-based auto-discovery via fetchSrVenueIdFromTipsee.
 */
export function resolveSevenRoomsVenueId(
  kevaVenueId: string,
): string {
  // 1. Static map (non-empty env var)
  const staticId = SEVENROOMS_VENUE_MAP[kevaVenueId] ?? '';
  if (staticId) return staticId;

  // 2. Runtime cache (includes '' for venues confirmed to have no SR access)
  return srVenueIdCache.get(kevaVenueId) ?? '';
}

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface SevenRoomsShift {
  name: string;
  category: string;
  /** "17:00:00" local time */
  start_time: string;
  /** "02:00:00" — may be next-day */
  end_time: string;
  /** Party size → duration in minutes. Key "-1" = default/large party. */
  duration_minutes_by_party_size: Record<string, number>;
  interval_minutes: number;
  /** Max covers bookable per interval (e.g. 50 covers per 30 min slot) */
  covers_per_seating_interval: number;
  /** Slot-level overrides: "17:00" → custom cover count */
  custom_pacing: Record<string, number>;
}

export interface SevenRoomsReservation {
  id: string;
  venue_id: string;
  first_name: string;
  last_name: string;
  date: string;
  arrival_time: string;
  seated_time: string | null;
  left_time: string | null;
  status: string;
  max_guests: number;
  arrived_guests: number | null;
  table_numbers: string[];
  is_vip: boolean;
  booked_by: string | null;
  served_by: string | null;
  notes: string;
  client_requests: string | null;
  tags: Array<{ group: string; tag: string; color: string }>;
  check_numbers: string;
  pos_tickets: Array<{
    code: string;
    total: number;
    subtotal: number;
    tax: number;
    service_charge: number;
    admin_fee: number;
    tip?: number;
    employee_name: string;
    table_no: string;
    start_time: string;
    end_time: string;
    status: string;
  }>;
  min_price: number | null;
  total_payment: number;
  prepayment: number | null;
  shift_category: string;
  updated: string;
  created: string;
}

// ══════════════════════════════════════════════════════════════════════════
// TOKEN CACHE
// Module-level — survives warm invocations, discarded on cold start.
// Good enough: re-auth costs ~200ms and happens at most once per 12hr.
// ══════════════════════════════════════════════════════════════════════════

interface TokenCache {
  token: string;
  expiresAt: Date;
}

let tokenCache: TokenCache | null = null;

async function authenticate(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > new Date()) {
    return tokenCache.token;
  }

  const clientId = process.env.SEVENROOMS_CLIENT_ID;
  const clientSecret = process.env.SEVENROOMS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SEVENROOMS_CLIENT_ID / SEVENROOMS_CLIENT_SECRET not configured');
  }

  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });

  const res = await fetch(`${BASE_URL}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`SevenRooms auth failed: ${res.status}`);
  }

  const json = await res.json() as {
    status: number;
    data: { token: string; token_expiration_datetime: string };
  };

  if (json.status !== 200) {
    throw new Error(`SevenRooms auth error: ${JSON.stringify(json)}`);
  }

  tokenCache = {
    token: json.data.token,
    expiresAt: new Date(json.data.token_expiration_datetime),
  };

  return tokenCache.token;
}

// ══════════════════════════════════════════════════════════════════════════
// SHIFTS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Fetch shift schedule for a date range from SevenRooms.
 * Returns a map of date string → shifts for that day.
 *
 * Use start_date = end_date to fetch a single day.
 */
export async function fetchShifts(
  sevenRoomsVenueId: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, SevenRoomsShift[]>> {
  if (!sevenRoomsVenueId) return {};

  const token = await authenticate();

  const url = `${BASE_URL}/venues/${sevenRoomsVenueId}/shifts?start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`SevenRooms shifts fetch failed: ${res.status} for venue ${sevenRoomsVenueId}`);
  }

  const json = await res.json() as { status: number; data: { shifts: Record<string, SevenRoomsShift[]> } };
  return json.data?.shifts ?? {};
}

/**
 * Get shifts for a single date.
 * Returns the shifts array for that day, or [] if none.
 */
export async function fetchShiftsForDate(
  sevenRoomsVenueId: string,
  date: string,
): Promise<SevenRoomsShift[]> {
  const shiftsMap = await fetchShifts(sevenRoomsVenueId, date, date);
  return shiftsMap[date] ?? [];
}

// ══════════════════════════════════════════════════════════════════════════
// TURN TIME HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Resolve authoritative turn time for a given party size from SevenRooms shift data.
 * Uses the shift's duration_minutes_by_party_size map.
 * Falls back: exact party size → "-1" (default) → provided fallback.
 */
export function getTurnMinutesFromShift(
  partySize: number,
  shifts: SevenRoomsShift[],
  fallbackMinutes = 90,
): number {
  if (shifts.length === 0) return fallbackMinutes;

  // Use the first (primary) shift of the day
  const shift = shifts[0];
  const map = shift.duration_minutes_by_party_size;

  // Exact match
  const exact = map[String(partySize)];
  if (exact) return exact;

  // Find nearest party size that covers this party (round up)
  const keys = Object.keys(map)
    .map(Number)
    .filter(k => !isNaN(k) && k > 0)
    .sort((a, b) => a - b);

  for (const key of keys) {
    if (partySize <= key) return map[String(key)] ?? fallbackMinutes;
  }

  // Default key "-1" = large party catch-all
  return map['-1'] ?? fallbackMinutes;
}

/**
 * Build a Map<partySize, turnMinutes> from shifts for fast lookup.
 * Covers party sizes 1–20 using the shift's duration map.
 */
export function buildTurnTimeMapFromShifts(
  shifts: SevenRoomsShift[],
): Map<number, number> {
  const result = new Map<number, number>();
  if (shifts.length === 0) return result;

  for (let p = 1; p <= 20; p++) {
    result.set(p, getTurnMinutesFromShift(p, shifts));
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// PACING
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get the effective pacing limit (max covers) for a specific time slot.
 * Checks custom_pacing first (slot-level override), then falls back to
 * covers_per_seating_interval (shift-level default).
 *
 * @param slotStartHour - slot start in decimal hours (e.g. 18.5 = 6:30 PM)
 * @param shifts - shifts for the day
 */
export function getPacingForSlot(
  slotStartHour: number,
  shifts: SevenRoomsShift[],
): number | null {
  if (shifts.length === 0) return null;

  const shift = shifts[0];

  // Check custom_pacing: keyed as "HH:MM" in local time
  if (shift.custom_pacing && Object.keys(shift.custom_pacing).length > 0) {
    const h = Math.floor(slotStartHour >= 24 ? slotStartHour - 24 : slotStartHour);
    const m = Math.round((slotStartHour % 1) * 60);
    const key = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (shift.custom_pacing[key] !== undefined) {
      return shift.custom_pacing[key];
    }
  }

  return shift.covers_per_seating_interval;
}

// ══════════════════════════════════════════════════════════════════════════
// RESERVATIONS EXPORT
// ══════════════════════════════════════════════════════════════════════════

export interface SevenRoomsVenue {
  id: string;
  name: string;
  venue_group_id: string;
  timezone: string;
  address: string;
}

/**
 * List all venues in a SevenRooms venue group.
 * Use this to discover venue IDs for mapping KevaOS venues to SR.
 */
export async function fetchVenuesInGroup(
  venueGroupId: string,
): Promise<SevenRoomsVenue[]> {
  const token = await authenticate();
  const res = await fetch(`${BASE_URL}/venues?venue_group_id=${encodeURIComponent(venueGroupId)}`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`SevenRooms venues fetch failed: ${res.status}`);
  }

  const json = await res.json() as {
    status: number;
    data: { results?: SevenRoomsVenue[]; venues?: SevenRoomsVenue[] };
  };

  // SR uses `results` on export endpoints, `venues` on entity endpoints — handle both
  return json.data?.results ?? json.data?.venues ?? [];
}

/**
 * Fetch all reservations for a specific venue and date directly from SevenRooms.
 * Use this for today/future dates to bypass TipSee sync lag.
 *
 * Uses GET /venues/{venue_id}/reservations?date=YYYY-MM-DD — the same per-venue
 * pattern as shifts. The export endpoint with updated_since is NOT suitable here
 * because it only surfaces reservations MODIFIED since that time, missing
 * reservations booked earlier in the week for today's service.
 *
 * Falls back to export endpoint (venue_group_id + 90-day lookback, filtered by date)
 * if the per-venue endpoint fails, to maximise resilience.
 */
export async function fetchReservationsForVenueDate(
  srVenueId: string,
  date: string,
): Promise<SevenRoomsReservation[]> {
  if (!srVenueId) return [];

  const token = await authenticate();

  // ── Primary: per-venue endpoint (mirrors shift endpoint pattern) ─────────
  const perVenueRes = await fetch(
    `${BASE_URL}/venues/${encodeURIComponent(srVenueId)}/reservations?date=${date}`,
    {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }
  );

  if (perVenueRes.ok) {
    const json = await perVenueRes.json() as {
      status: number;
      data: { reservations?: SevenRoomsReservation[]; results?: SevenRoomsReservation[] };
    };
    return json.data?.reservations ?? json.data?.results ?? [];
  }

  // ── Fallback: export endpoint, 90-day lookback, filter by date in memory ──
  // Covers the case where the per-venue endpoint isn't available on this token.
  // 90-day lookback captures reservations booked weeks in advance.
  const lookbackDate = new Date(date + 'T12:00:00');
  lookbackDate.setDate(lookbackDate.getDate() - 90);
  const updatedSince = lookbackDate.toISOString().slice(0, 10) + 'T00:00:00';

  const results: SevenRoomsReservation[] = [];
  let cursor: string | number | null = null;
  const limit = 200;

  while (true) {
    const params = new URLSearchParams({
      venue_id: srVenueId,
      updated_since: updatedSince,
      limit: String(limit),
    });
    if (cursor !== null) params.set('cursor', String(cursor));

    const res = await fetch(`${BASE_URL}/reservations/export?${params}`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`SevenRooms reservations fetch failed: ${res.status} for venue ${srVenueId}`);
    }

    const json = await res.json() as {
      status: number;
      data: { results: SevenRoomsReservation[]; cursor: string | number };
    };

    const page = json.data?.results ?? [];
    results.push(...page);

    if (page.length < limit) break;
    cursor = json.data.cursor;
  }

  return results.filter(r => r.date === date);
}

/**
 * Fetch all reservations updated since a given timestamp.
 * Paginates automatically using the scroll cursor.
 *
 * For a single date's book, prefer fetchReservationsForDateDirect which
 * filters by date after fetching recent changes.
 */
export async function fetchReservationsUpdatedSince(
  venueGroupId: string,
  updatedSince: string, // ISO date string e.g. "2026-03-01T00:00:00"
  limit = 200,
): Promise<SevenRoomsReservation[]> {
  const token = await authenticate();
  const results: SevenRoomsReservation[] = [];
  let cursor: string | number | null = null;

  while (true) {
    const params = new URLSearchParams({
      venue_group_id: venueGroupId,
      updated_since: updatedSince,
      limit: String(limit),
    });
    if (cursor !== null) params.set('cursor', String(cursor));

    const url = `${BASE_URL}/reservations/export?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`SevenRooms reservations fetch failed: ${res.status}`);
    }

    const json = await res.json() as {
      status: number;
      data: { results: SevenRoomsReservation[]; cursor: string | number };
    };

    const page = json.data?.results ?? [];
    results.push(...page);

    if (page.length < limit) break; // last page
    cursor = json.data.cursor;
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════════════
// WRITE: PUSH SETTINGS TO SR
// ══════════════════════════════════════════════════════════════════════════

export interface PushResult {
  success: boolean;
  status: 'success' | 'error' | 'unsupported';
  message: string;
}

// ══════════════════════════════════════════════════════════════════════════
// WIDGET API: ACCESS RULES (PUBLIC, NO AUTH REQUIRED)
//
// The public widget API at api-yoa/availability/widget/range returns per-slot
// access rule data including pacing_limit, pacing_covers_remaining,
// access_rule_id, seating area, policies, min_spend, service charges.
//
// This is the ONLY way to read access rule pacing data — the authenticated
// /access_rules endpoint returns 403 (credential scope not provisioned).
// ══════════════════════════════════════════════════════════════════════════

const WIDGET_BASE_URL = 'https://www.sevenrooms.com/api-yoa/availability/widget/range';

export interface WidgetAccessRuleSlot {
  time: string;
  type: 'book' | 'request';
  access_persistent_id: string;
  access_rule_id: string;
  access_seating_area_id: string | null;
  pacing_limit: number | null;
  pacing_covers_remaining: number | null;
  public_time_slot_description: string;
  is_exclusive: boolean;
  default_service_charge: number;
  default_gratuity: number;
  min_spend: number | null;
}

export interface WidgetAccessRule {
  ruleId: string;
  description: string;
  pacingLimit: number | null;
  seatingAreaId: string | null;
  isExclusive: boolean;
  serviceCharge: number;
  gratuity: number;
  minSpend: number | null;
  slots: Array<{ time: string; coversRemaining: number | null }>;
}

export interface WidgetShiftData {
  shiftName: string;
  accessRules: WidgetAccessRule[];
  requestOnlySlots: string[];
}

/**
 * Fetch access rule data from the public widget API.
 *
 * Returns per-shift access rules with pacing limits and remaining capacity.
 * No authentication required — uses venue slug.
 *
 * @param slug - SevenRooms venue slug (e.g. 'delilahla')
 * @param date - Date in MM-DD-YYYY format (widget API format)
 */
export async function fetchWidgetAccessRules(
  slug: string,
  date: string,
): Promise<WidgetShiftData[]> {
  const url = `${WIDGET_BASE_URL}?venue=${slug}&time_slot=19:00&party_size=4&halo_size_interval=16&start_date=${date}&num_days=1&channel=SEVENROOMS_WIDGET`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) return [];

  const json = await res.json() as {
    data?: {
      availability?: Record<string, Array<{
        name: string;
        times: WidgetAccessRuleSlot[];
      }>>;
    };
  };

  const availability = json.data?.availability;
  if (!availability) return [];

  // The response keys are YYYY-MM-DD format
  const dayData = Object.values(availability)[0];
  if (!dayData || !Array.isArray(dayData)) return [];

  const results: WidgetShiftData[] = [];

  for (const shift of dayData) {
    if (!shift.times) continue;

    const bookSlots = shift.times.filter(t => t.type === 'book');
    const reqSlots = shift.times.filter(t => t.type === 'request');

    // Group book slots by access_persistent_id to identify distinct rules
    const ruleGroups = new Map<string, WidgetAccessRule>();

    for (const slot of bookSlots) {
      const ruleKey = slot.access_persistent_id || 'unknown';
      if (!ruleGroups.has(ruleKey)) {
        ruleGroups.set(ruleKey, {
          ruleId: ruleKey,
          description: slot.public_time_slot_description || '',
          pacingLimit: slot.pacing_limit,
          seatingAreaId: slot.access_seating_area_id || null,
          isExclusive: slot.is_exclusive,
          serviceCharge: slot.default_service_charge,
          gratuity: slot.default_gratuity,
          minSpend: slot.min_spend || null,
          slots: [],
        });
      }
      ruleGroups.get(ruleKey)!.slots.push({
        time: slot.time,
        coversRemaining: slot.pacing_covers_remaining ?? null,
      });
    }

    results.push({
      shiftName: shift.name,
      accessRules: Array.from(ruleGroups.values()),
      requestOnlySlots: reqSlots.map(s => s.time),
    });
  }

  return results;
}

/**
 * Fetch widget access rules for an KevaOS venue by UUID.
 * Resolves the slug from SEVENROOMS_SLUG_MAP and formats the date for the widget API.
 */
export async function fetchWidgetAccessRulesForVenue(
  kevaVenueId: string,
  isoDate: string,
): Promise<WidgetShiftData[]> {
  const slug = SEVENROOMS_SLUG_MAP[kevaVenueId];
  if (!slug) return [];

  // Widget API expects MM-DD-YYYY format
  const [y, m, d] = isoDate.split('-');
  const widgetDate = `${m}-${d}-${y}`;

  return fetchWidgetAccessRules(slug, widgetDate);
}

/**
 * Attempt to push pacing/shift settings to SevenRooms.
 *
 * SR API may not support write endpoints for shifts/pacing. This function
 * gracefully detects 404/405 and returns 'unsupported' instead of throwing.
 */
export async function pushShiftSettings(
  srVenueId: string,
  settings: {
    covers_per_seating_interval?: number;
    custom_pacing?: Record<string, number>;
    interval_minutes?: number;
  },
): Promise<PushResult> {
  try {
    const token = await authenticate();

    const res = await fetch(`${BASE_URL}/venues/${encodeURIComponent(srVenueId)}/shifts`, {
      method: 'PUT',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (res.status === 404 || res.status === 405) {
      return {
        success: false,
        status: 'unsupported',
        message: 'SevenRooms API does not support writing shift/pacing settings',
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        success: false,
        status: 'error',
        message: `SR API returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    return { success: true, status: 'success', message: 'Settings pushed to SevenRooms' };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: err.message || 'Push failed',
    };
  }
}

/**
 * Write guest notes back to a SevenRooms reservation.
 *
 * Caller should pass the full (merged) notes string — this function
 * overwrites the reservation's notes field in SR.
 *
 * Follows the pushShiftSettings pattern: graceful 404/405 → 'unsupported'.
 */
export async function updateReservationNotes(
  srReservationId: string,
  notes: string,
): Promise<PushResult> {
  try {
    const token = await authenticate();

    const res = await fetch(
      `${BASE_URL}/reservations/${encodeURIComponent(srReservationId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (res.status === 404 || res.status === 405) {
      return {
        success: false,
        status: 'unsupported',
        message: 'SevenRooms API does not support updating reservation notes',
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        success: false,
        status: 'error',
        message: `SR API returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    return { success: true, status: 'success', message: 'Notes pushed to SevenRooms' };
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: err.message || 'Notes push failed',
    };
  }
}
