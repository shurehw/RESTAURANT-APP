/**
 * Sales Pace Data Access Layer
 *
 * Provides typed access to sales snapshots, pace settings, forecasts,
 * and SDLW comparisons. Follows greeting-metrics.ts patterns:
 * service client, in-memory caching, typed interfaces.
 */

import { getServiceClient } from '@/lib/supabase/service';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

export interface SalesSnapshot {
  id: string;
  venue_id: string;
  business_date: string;
  snapshot_at: string;
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  checks_count: number;
  covers_count: number;
  comps_total: number;
  voids_total: number;
  avg_check: number | null;
  bev_pct: number | null;
}

export interface SalesPaceSettings {
  id: string;
  venue_id: string;
  polling_interval_seconds: number;
  service_start_hour: number;
  service_end_hour: number;
  use_forecast: boolean;
  use_sdlw: boolean;
  pace_warning_pct: number;
  pace_critical_pct: number;
  is_active: boolean;
}

export interface ForecastData {
  covers_predicted: number;
  revenue_predicted: number;
  covers_lower: number;
  covers_upper: number;
}

export interface SDLWData {
  gross_sales: number;
  net_sales: number;
  covers_count: number;
  checks_count: number;
  food_sales: number;
  beverage_sales: number;
}

export type PaceStatus = 'on_pace' | 'warning' | 'critical' | 'no_target';

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE (settings change infrequently)
// ══════════════════════════════════════════════════════════════════════════

const settingsCache = new Map<string, { data: SalesPaceSettings; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isFresh(ts: number): boolean {
  return Date.now() - ts < CACHE_TTL_MS;
}

// ══════════════════════════════════════════════════════════════════════════
// ACTIVE VENUES (for polling service)
// ══════════════════════════════════════════════════════════════════════════

export async function getActiveSalesPaceVenues(): Promise<
  { venue_id: string; polling_interval_seconds: number }[]
> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('sales_pace_settings')
    .select('venue_id, polling_interval_seconds')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch active sales pace venues:', error.message);
    return [];
  }

  return data || [];
}

// ══════════════════════════════════════════════════════════════════════════
// PACE SETTINGS
// ══════════════════════════════════════════════════════════════════════════

export async function getSalesPaceSettings(
  venueId: string
): Promise<SalesPaceSettings | null> {
  const cached = settingsCache.get(venueId);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('sales_pace_settings')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    console.error('Failed to fetch sales pace settings:', error.message);
    return null;
  }

  const settings = normalizeSettings(data);
  settingsCache.set(venueId, { data: settings, ts: Date.now() });
  return settings;
}

// ══════════════════════════════════════════════════════════════════════════
// SNAPSHOTS
// ══════════════════════════════════════════════════════════════════════════

export async function storeSalesSnapshot(snapshot: {
  venue_id: string;
  business_date: string;
  snapshot_at: string;
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  checks_count: number;
  covers_count: number;
  comps_total: number;
  voids_total: number;
}): Promise<SalesSnapshot | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('sales_snapshots')
    .upsert(snapshot, { onConflict: 'venue_id,business_date,snapshot_at' })
    .select('*')
    .single();

  if (error) {
    console.error('Failed to store sales snapshot:', error.message);
    return null;
  }

  return normalizeSnapshot(data);
}

export async function getSnapshotsForDate(
  venueId: string,
  date: string
): Promise<SalesSnapshot[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('sales_snapshots')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('snapshot_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch sales snapshots:', error.message);
    return [];
  }

  return (data || []).map(normalizeSnapshot);
}

export async function getLatestSnapshot(
  venueId: string,
  date?: string
): Promise<SalesSnapshot | null> {
  const supabase = getServiceClient();
  let query = (supabase as any)
    .from('sales_snapshots')
    .select('*')
    .eq('venue_id', venueId)
    .order('snapshot_at', { ascending: false })
    .limit(1);

  if (date) {
    query = query.eq('business_date', date);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error('Failed to fetch latest snapshot:', error.message);
    return null;
  }

  return data ? normalizeSnapshot(data) : null;
}

// ══════════════════════════════════════════════════════════════════════════
// FORECAST & SDLW COMPARISON DATA
// ══════════════════════════════════════════════════════════════════════════

export async function getForecastForDate(
  venueId: string,
  date: string
): Promise<ForecastData | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('forecasts_with_bias')
    .select('covers_predicted, revenue_predicted, covers_lower, covers_upper')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch forecast:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    covers_predicted: parseFloat(data.covers_predicted) || 0,
    revenue_predicted: parseFloat(data.revenue_predicted) || 0,
    covers_lower: parseFloat(data.covers_lower) || 0,
    covers_upper: parseFloat(data.covers_upper) || 0,
  };
}

export async function getSDLWFacts(
  venueId: string,
  date: string
): Promise<SDLWData | null> {
  // Calculate same day last week
  const current = new Date(date);
  const sdlw = new Date(current);
  sdlw.setDate(sdlw.getDate() - 7);
  const sdlwStr = sdlw.toISOString().split('T')[0];

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_day_facts')
    .select('gross_sales, net_sales, covers_count, checks_count, food_sales, beverage_sales')
    .eq('venue_id', venueId)
    .eq('business_date', sdlwStr)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch SDLW facts:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    gross_sales: parseFloat(data.gross_sales) || 0,
    net_sales: parseFloat(data.net_sales) || 0,
    covers_count: parseInt(data.covers_count) || 0,
    checks_count: parseInt(data.checks_count) || 0,
    food_sales: parseFloat(data.food_sales) || 0,
    beverage_sales: parseFloat(data.beverage_sales) || 0,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PACE COMPUTATION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Calculate projected end-of-day revenue based on current velocity.
 * Uses elapsed % of total service hours to extrapolate.
 */
export function computeProjectedEOD(
  currentTotal: number,
  serviceStartHour: number,
  serviceEndHour: number,
  now?: Date
): number {
  const current = now || new Date();
  const currentMinutes = current.getHours() * 60 + current.getMinutes();

  // Total service minutes (handle overnight)
  let totalMinutes: number;
  if (serviceStartHour <= serviceEndHour) {
    totalMinutes = (serviceEndHour - serviceStartHour) * 60;
  } else {
    totalMinutes = (24 - serviceStartHour + serviceEndHour) * 60;
  }

  // Elapsed minutes since service start
  let elapsedMinutes: number;
  const startMinutes = serviceStartHour * 60;
  if (serviceStartHour <= serviceEndHour) {
    elapsedMinutes = currentMinutes - startMinutes;
  } else {
    if (currentMinutes >= startMinutes) {
      elapsedMinutes = currentMinutes - startMinutes;
    } else {
      elapsedMinutes = (24 * 60 - startMinutes) + currentMinutes;
    }
  }

  // Clamp to valid range
  elapsedMinutes = Math.max(1, Math.min(elapsedMinutes, totalMinutes));

  const elapsedPct = elapsedMinutes / totalMinutes;
  return Math.round(currentTotal / elapsedPct);
}

/**
 * Determine pace status based on projected EOD vs target.
 */
export function computePaceStatus(
  projectedEOD: number,
  target: number,
  settings: SalesPaceSettings | null
): PaceStatus {
  if (!target || target <= 0) return 'no_target';

  const warningPct = settings?.pace_warning_pct ?? 15;
  const criticalPct = settings?.pace_critical_pct ?? 25;

  const pctOfTarget = (projectedEOD / target) * 100;
  const pctBelow = 100 - pctOfTarget;

  if (pctBelow >= criticalPct) return 'critical';
  if (pctBelow >= warningPct) return 'warning';
  return 'on_pace';
}

// ══════════════════════════════════════════════════════════════════════════
// TIPSEE MAPPING HELPER
// ══════════════════════════════════════════════════════════════════════════

export async function getTipseeMappingForVenue(
  venueId: string
): Promise<string[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venue_tipsee_mapping')
    .select('tipsee_location_uuid')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch TipSee mapping:', error.message);
    return [];
  }

  return (data || []).map((r: any) => r.tipsee_location_uuid);
}

// ══════════════════════════════════════════════════════════════════════════
// VENUE TIMEZONE
// ══════════════════════════════════════════════════════════════════════════

const timezoneCache = new Map<string, { tz: string; ts: number }>();

export async function getVenueTimezone(venueId: string): Promise<string> {
  const cached = timezoneCache.get(venueId);
  if (cached && isFresh(cached.ts)) return cached.tz;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('venues')
    .select('timezone')
    .eq('id', venueId)
    .maybeSingle();

  const tz = data?.timezone || 'America/Los_Angeles';
  timezoneCache.set(venueId, { tz, ts: Date.now() });
  return tz;
}

/**
 * Get the current time in a venue's timezone.
 */
export function getNowInTimezone(tz: string): Date {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
  return new Date(nowStr);
}

/**
 * Business date in venue timezone: before 5 AM = previous day.
 */
export function getBusinessDateForTimezone(tz: string): string {
  const local = getNowInTimezone(tz);
  if (local.getHours() < 5) {
    local.setDate(local.getDate() - 1);
  }
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const d = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Check if current time (in venue timezone) is within service hours.
 * Handles overnight ranges (e.g., 17 to 3).
 */
export function isWithinServiceHoursForTimezone(
  startHour: number,
  endHour: number,
  tz: string
): boolean {
  const local = getNowInTimezone(tz);
  const currentHour = local.getHours();

  if (startHour <= endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    // Overnight range
    return currentHour >= startHour || currentHour < endHour;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// NORMALIZERS
// ══════════════════════════════════════════════════════════════════════════

function normalizeSettings(row: any): SalesPaceSettings {
  return {
    id: row.id,
    venue_id: row.venue_id,
    polling_interval_seconds: row.polling_interval_seconds,
    service_start_hour: row.service_start_hour,
    service_end_hour: row.service_end_hour,
    use_forecast: row.use_forecast,
    use_sdlw: row.use_sdlw,
    pace_warning_pct: parseFloat(row.pace_warning_pct),
    pace_critical_pct: parseFloat(row.pace_critical_pct),
    is_active: row.is_active,
  };
}

function normalizeSnapshot(row: any): SalesSnapshot {
  return {
    id: row.id,
    venue_id: row.venue_id,
    business_date: row.business_date,
    snapshot_at: row.snapshot_at,
    gross_sales: parseFloat(row.gross_sales) || 0,
    net_sales: parseFloat(row.net_sales) || 0,
    food_sales: parseFloat(row.food_sales) || 0,
    beverage_sales: parseFloat(row.beverage_sales) || 0,
    checks_count: parseInt(row.checks_count) || 0,
    covers_count: parseInt(row.covers_count) || 0,
    comps_total: parseFloat(row.comps_total) || 0,
    voids_total: parseFloat(row.voids_total) || 0,
    avg_check: row.avg_check != null ? parseFloat(row.avg_check) : null,
    bev_pct: row.bev_pct != null ? parseFloat(row.bev_pct) : null,
  };
}
