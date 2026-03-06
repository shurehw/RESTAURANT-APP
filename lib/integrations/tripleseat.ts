/**
 * Tripleseat API Client
 *
 * Supports:
 *  - OAuth 1.0 auth (api_key + secret_key signed requests)
 *  - Events listing, search, and detail fetch
 *  - Bookings listing and search
 *  - Sites listing (for venue mapping)
 *
 * Auth: OAuth 1.0 signed requests with consumer_key + consumer_secret
 * Base: https://api.tripleseat.com/v1
 *
 * Rate limit: 10 requests/second on events endpoint
 */

import { createHmac, randomBytes } from 'crypto';

const BASE_URL = 'https://api.tripleseat.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;

// ══════════════════════════════════════════════════════════════════════════
// OAUTH 1.0 SIGNING
// ══════════════════════════════════════════════════════════════════════════

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

function buildOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };

  // Combine all params for signature base string
  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  // Signature base string
  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join('&');

  // Signing key (consumer_secret&) — no token secret for 2-legged OAuth
  const signingKey = `${percentEncode(consumerSecret)}&`;
  const signature = createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  oauthParams['oauth_signature'] = signature;

  // Build Authorization header
  const headerParts = Object.entries(oauthParams)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(', ');

  return `OAuth ${headerParts}`;
}

// ══════════════════════════════════════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════════════════════════════════════

function getCredentials(): { apiKey: string; secretKey: string } {
  const apiKey = process.env.TRIPLESEAT_API_KEY;
  const secretKey = process.env.TRIPLESEAT_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error('TRIPLESEAT_API_KEY / TRIPLESEAT_SECRET_KEY not configured');
  }

  return { apiKey, secretKey };
}

async function tripleseatFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const { apiKey, secretKey } = getCredentials();
  const url = `${BASE_URL}${path}`;

  const authHeader = buildOAuthHeader('GET', url, params, apiKey, secretKey);

  const queryString = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const fullUrl = queryString ? `${url}?${queryString}` : url;

  const res = await fetch(fullUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tripleseat API error ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface TripleseatSite {
  id: number;
  name: string;
  customer_id: number;
  subdomain?: string;
  timezone?: string;
}

export interface TripleseatLocation {
  id: number;
  site_id: number;
  name: string;
}

export interface TripleseatEvent {
  id: number;
  site_id: number;
  location_id: number;
  booking_id?: number;
  name?: string;
  event_type?: string;
  status: string;
  event_date: string;               // "2/14/2026"
  event_date_iso8601: string;        // "2026-02-14"
  event_start_iso8601?: string;      // "2026-02-14T20:00:00-05:00"
  event_end_iso8601?: string;
  guest_count?: number;
  guaranteed_guest_count?: number;
  food_and_beverage_min?: string;    // "50000.0"
  grand_total?: string;              // "132797.5"
  actual_amount?: string;
  room_ids?: number[];
  rooms?: Array<{
    id: number;
    name: string;
  }>;
  contact_id?: number;
  contact?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export interface TripleseatBooking {
  id: number;
  event_ids: number[];
  status: string;
  location_id: number;
  start_date: string;
  end_date: string;
  total_event_actual_amount?: number;
  total_event_grand_total?: string;
  total_grand_total?: string;
}

interface PaginatedResponse<T> {
  total_pages: number;
  results: T[];
}

// ══════════════════════════════════════════════════════════════════════════
// API METHODS
// ══════════════════════════════════════════════════════════════════════════

/**
 * List all Tripleseat sites (venues).
 * Used for initial venue mapping setup.
 */
export async function fetchSites(): Promise<TripleseatSite[]> {
  const data = await tripleseatFetch<{ results: TripleseatSite[] }>('/sites.json');
  return data.results || [];
}

/**
 * Search events by date range for a specific site.
 */
export async function searchEvents(
  siteId: string,
  startDate: string,
  endDate: string,
  page = 1,
): Promise<PaginatedResponse<TripleseatEvent>> {
  const data = await tripleseatFetch<PaginatedResponse<TripleseatEvent>>(
    '/events/search.json',
    {
      site_id: siteId,
      start_date: startDate,
      end_date: endDate,
      page: String(page),
      per_page: '50',
    },
  );
  return data;
}

/**
 * Get a single event by ID.
 */
export async function fetchEvent(eventId: number): Promise<TripleseatEvent> {
  const data = await tripleseatFetch<{ event: TripleseatEvent }>(
    `/events/${eventId}.json`,
  );
  return data.event;
}

/**
 * Search bookings by date range for a specific site.
 */
export async function searchBookings(
  siteId: string,
  startDate: string,
  endDate: string,
  page = 1,
): Promise<PaginatedResponse<TripleseatBooking>> {
  const data = await tripleseatFetch<PaginatedResponse<TripleseatBooking>>(
    '/bookings/search.json',
    {
      site_id: siteId,
      start_date: startDate,
      end_date: endDate,
      page: String(page),
      per_page: '50',
    },
  );
  return data;
}

/**
 * Fetch all events for a site in a date range, handling pagination.
 * API returns `total_pages` — we iterate until page > total_pages or no results.
 */
export async function fetchAllEventsForRange(
  siteId: string,
  startDate: string,
  endDate: string,
): Promise<TripleseatEvent[]> {
  const allEvents: TripleseatEvent[] = [];
  let page = 1;

  while (true) {
    const data = await searchEvents(siteId, startDate, endDate, page);
    const results = data.results || [];

    // Results come wrapped as { event: { ... } } — unwrap if needed
    for (const item of results) {
      const ev = (item as any).event || item;
      allEvents.push(ev);
    }

    if (results.length === 0 || page >= data.total_pages) {
      break;
    }
    page++;
  }

  return allEvents;
}

// ══════════════════════════════════════════════════════════════════════════
// WEBHOOK SIGNATURE VERIFICATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Verify a Tripleseat webhook signature.
 * Tripleseat signs webhook payloads with HMAC-SHA256 using the signing key.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  signingKey: string,
): boolean {
  const computed = createHmac('sha256', signingKey)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison
  if (computed.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

// ══════════════════════════════════════════════════════════════════════════
// EVENT NORMALIZATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Classify a Tripleseat event as buyout vs private room.
 * Buyout detection: room names containing "buyout", event_type, or event name.
 * Financial fields are strings in the API (e.g. "50000.0").
 */
export function classifyEvent(event: TripleseatEvent): {
  isBuyout: boolean;
  eventType: string;
  totalMinimum: number;
  estimatedRevenue: number;
} {
  const roomNames = (event.rooms || []).map(r => r.name.toLowerCase());
  const eventName = (event.name || '').toLowerCase();
  const rawType = (event.event_type || '').toLowerCase();

  // Detect buyout from room names, event type, or event name
  let isBuyout = roomNames.some(r => r.includes('buyout'))
    || rawType.includes('buyout')
    || eventName.includes('buyout');

  // Classify event type
  let eventType = 'private_event';
  if (isBuyout) {
    eventType = 'buyout';
  } else if (rawType.includes('semi')) {
    eventType = 'semi_private';
  } else if (rawType.includes('reception') || rawType.includes('cocktail')) {
    eventType = 'reception';
  }

  // Parse financial fields (API returns strings like "50000.0")
  const totalMinimum = parseFloat(event.food_and_beverage_min || '0') || 0;
  const estimatedRevenue = parseFloat(event.grand_total || '0') || 0;

  return { isBuyout, eventType, totalMinimum, estimatedRevenue };
}
