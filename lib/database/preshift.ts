/**
 * lib/database/preshift.ts
 * Data access layer for preshift briefing data.
 * Pattern: lib/database/reservations.ts
 */

import { getServiceClient } from '@/lib/supabase/service';
import { getReservationsForVenueDate } from '@/lib/database/reservations';
import { shouldSilenceMissingRelationError } from '@/lib/database/schema-guards';

// ── Types ────────────────────────────────────────────────────────

export interface EightySixedItem {
  name: string;
  qty?: number;
}

export interface PreshiftNotes {
  id: string;
  flow_of_service: string | null;
  announcements: string | null;
  service_notes: string | null;
  food_notes: string | null;
  beverage_notes: string | null;
  company_news: string | null;
  zone_cleaning: string | null;
  eightysixed: EightySixedItem[];
  updated_at: string;
  updated_by: string | null;
}

export interface PreshiftNotesInput {
  flow_of_service?: string;
  announcements?: string;
  service_notes?: string;
  food_notes?: string;
  beverage_notes?: string;
  company_news?: string;
  zone_cleaning?: string;
  eightysixed?: EightySixedItem[];
}

export interface StaffingByPosition {
  position: string;
  count: number;
  names: string[];
}

export interface VipReservation {
  time: string;
  party_size: number;
  name: string;
  notes: string | null;
  client_requests: string | null;
  min_spend: number | null;
  tags: unknown[];
}

export interface LargeParty {
  time: string;
  party_size: number;
  name: string;
  notes: string | null;
  min_spend: number | null;
}

export interface ReviewSummary {
  reviews: Array<{ source: string; rating: number; snippet: string; date: string }>;
  avg_rating: number | null;
  count_last_7d: number;
}

// ── Functions ────────────────────────────────────────────────────

/**
 * Get manager-authored preshift notes for a venue+date.
 */
export async function getPreshiftNotes(
  venueId: string,
  date: string,
): Promise<PreshiftNotes | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('preshift_notes')
    .select('id, flow_of_service, announcements, service_notes, food_notes, beverage_notes, company_news, zone_cleaning, eightysixed, updated_at, updated_by')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .maybeSingle();

  if (error) {
    if (shouldSilenceMissingRelationError('preshift', 'preshift_notes', error)) {
      return null;
    }
    console.error('[preshift] Failed to fetch notes:', error.message);
    return null;
  }
  return data || null;
}

/**
 * Upsert manager preshift notes (auto-save).
 * Uses ON CONFLICT (venue_id, business_date) to insert or update.
 */
export async function upsertPreshiftNotes(
  orgId: string,
  venueId: string,
  date: string,
  notes: Partial<PreshiftNotesInput>,
  userId: string,
): Promise<void> {
  const supabase = getServiceClient();

  const row: Record<string, unknown> = {
    org_id: orgId,
    venue_id: venueId,
    business_date: date,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  // Only include note fields that were provided
  const fields: (keyof PreshiftNotesInput)[] = [
    'flow_of_service', 'announcements', 'service_notes',
    'food_notes', 'beverage_notes', 'company_news', 'zone_cleaning', 'eightysixed',
  ];
  for (const f of fields) {
    if (notes[f] !== undefined) {
      row[f] = notes[f];
    }
  }

  const { error } = await (supabase as any)
    .from('preshift_notes')
    .upsert(row, { onConflict: 'venue_id,business_date' });

  if (error) {
    console.error('[preshift] Failed to upsert notes:', error.message);
    throw new Error(`Failed to save preshift notes: ${error.message}`);
  }
}

/**
 * Get covers forecast for a date.
 * Returns the most recent covers forecast yhat value.
 */
export async function getCoversForecast(
  venueId: string,
  date: string,
): Promise<number | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_day_forecast')
    .select('yhat')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .eq('forecast_type', 'covers')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (shouldSilenceMissingRelationError('preshift', 'venue_day_forecast', error)) {
      return null;
    }
    console.error('[preshift] Failed to fetch covers forecast:', error.message);
    return null;
  }
  return data?.yhat ?? null;
}

/**
 * Get tonight's staffing grouped by position.
 * Joins shift_assignments with employees and positions tables.
 */
export async function getStaffingSummary(
  venueId: string,
  date: string,
): Promise<StaffingByPosition[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('shift_assignments')
    .select(`
      employee_id,
      employees ( first_name, last_name ),
      positions ( name )
    `)
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .neq('status', 'cancelled');

  if (error || !data || data.length === 0) {
    if (error) console.error('[preshift] Failed to fetch staffing:', error.message);
    return [];
  }

  // Group by position name
  const byPosition = new Map<string, string[]>();
  for (const s of data) {
    const posName = s.positions?.name || 'Unknown';
    const empName = s.employees
      ? `${s.employees.first_name || ''} ${s.employees.last_name || ''}`.trim()
      : 'Unknown';

    if (!byPosition.has(posName)) {
      byPosition.set(posName, []);
    }
    byPosition.get(posName)!.push(empName);
  }

  return Array.from(byPosition.entries()).map(([position, names]) => ({
    position,
    count: names.length,
    names,
  }));
}

/**
 * Get VIP reservations for a venue on a date.
 * Filters reservations where is_vip=true.
 */
export async function getVipReservations(
  venueId: string,
  date: string,
): Promise<VipReservation[]> {
  const reservations = await getReservationsForVenueDate(venueId, date);

  return reservations
    .filter((r) => r.is_vip)
    .map((r) => ({
      time: r.arrival_time,
      party_size: r.party_size,
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      notes: r.notes,
      client_requests: r.client_requests,
      min_spend: r.min_spend,
      tags: r.tags || [],
    }));
}

/**
 * Get large parties (party_size >= minSize, default 8).
 * Excludes VIPs to avoid duplication with the VIP list.
 */
export async function getLargeParties(
  venueId: string,
  date: string,
  minSize?: number,
): Promise<LargeParty[]> {
  const threshold = minSize || 8;
  const reservations = await getReservationsForVenueDate(venueId, date);

  return reservations
    .filter((r) => r.party_size >= threshold && !r.is_vip)
    .map((r) => ({
      time: r.arrival_time,
      party_size: r.party_size,
      name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      notes: r.notes,
      min_spend: r.min_spend,
    }));
}

/**
 * Get recent reviews for a venue (last N days, default 7).
 * Returns individual reviews, average rating, and count.
 */
export async function getRecentReviews(
  venueId: string,
  days?: number,
): Promise<ReviewSummary> {
  const lookbackDays = days || 7;
  const supabase = getServiceClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const cutoff = cutoffDate.toISOString();

  // Fetch recent reviews
  const { data, error } = await (supabase as any)
    .from('reviews_raw')
    .select('source, rating, content, reviewed_at')
    .eq('venue_id', venueId)
    .gte('reviewed_at', cutoff)
    .order('reviewed_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('[preshift] Failed to fetch reviews:', error.message);
    return { reviews: [], avg_rating: null, count_last_7d: 0 };
  }

  const reviews = (data || []).map((r: any) => ({
    source: r.source || 'unknown',
    rating: Number(r.rating) || 0,
    snippet: r.content
      ? r.content.length > 200
        ? r.content.substring(0, 200) + '...'
        : r.content
      : '',
    date: r.reviewed_at?.split('T')[0] || '',
  }));

  // Compute average rating from fetched reviews
  const ratings = reviews.filter((r: { rating: number }) => r.rating > 0);
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / ratings.length) * 10) / 10
      : null;

  // Get total count for the period
  const { count } = await (supabase as any)
    .from('reviews_raw')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .gte('reviewed_at', cutoff);

  return {
    reviews,
    avg_rating: avgRating,
    count_last_7d: count || reviews.length,
  };
}

/**
 * Get 86'd items from previous night's culinary shift log.
 * Looks at culinary_shift_logs for the previous business date.
 */
export async function getPreviousNight86Items(
  venueId: string,
  date: string,
): Promise<string[]> {
  const supabase = getServiceClient();

  // Compute previous business date
  const d = new Date(date + 'T12:00:00Z');
  d.setDate(d.getDate() - 1);
  const prevDate = d.toISOString().split('T')[0];

  const { data, error } = await (supabase as any)
    .from('culinary_shift_logs')
    .select('eightysixed_items')
    .eq('venue_id', venueId)
    .eq('business_date', prevDate)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[preshift] Failed to fetch 86d items:', error.message);
    return [];
  }

  if (!data?.eightysixed_items || !Array.isArray(data.eightysixed_items)) {
    return [];
  }

  return data.eightysixed_items;
}

/**
 * Get tonight's entertainment bookings.
 */
export interface EntertainmentBooking {
  entertainment_type: string;
  config: string | null;
  artist_name: string | null;
  time_start: string | null;
  time_end: string | null;
  status: string;
  notes: string | null;
}

export async function getEntertainmentBookings(
  venueId: string,
  date: string,
): Promise<EntertainmentBooking[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('entertainment_bookings')
    .select('entertainment_type, config, artist_name, time_start, time_end, status, notes')
    .eq('venue_id', venueId)
    .eq('booking_date', date)
    .neq('status', 'cancelled')
    .order('time_start', { ascending: true });

  if (error) {
    console.error('[preshift] Failed to fetch entertainment:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Get tonight's private events from Tripleseat.
 */
export interface TripleseatEvent {
  event_name: string;
  event_type: string | null;
  start_time: string | null;
  end_time: string | null;
  guest_count: number | null;
  room_name: string | null;
  is_buyout: boolean;
  status: string;
}

export async function getTripleseatEvents(
  venueId: string,
  date: string,
): Promise<TripleseatEvent[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('tripleseat_events')
    .select('event_name, event_type, start_time, end_time, guest_count, room_name, is_buyout, status')
    .eq('venue_id', venueId)
    .eq('event_date', date)
    .in('status', ['definite', 'tentative'])
    .order('start_time', { ascending: true });

  if (error) {
    console.error('[preshift] Failed to fetch tripleseat events:', error.message);
    return [];
  }
  return data || [];
}
