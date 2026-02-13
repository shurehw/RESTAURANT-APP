/**
 * Greeting Metrics Data Access Layer
 *
 * Provides typed access to camera config, table zones, greeting settings,
 * and greeting metrics. Follows the comp-settings.ts patterns:
 * service client, in-memory caching, typed interfaces.
 */

import { getServiceClient } from '@/lib/supabase/service';
import type {
  CameraConfig,
  TableZone,
  GreetingSettings,
  GreetingMetric,
  GreetingStats,
  PolygonVertex,
} from '@/lib/cv/types';

// ══════════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE (config data changes infrequently)
// ══════════════════════════════════════════════════════════════════════════

const configCache = new Map<string, { data: CameraConfig[]; ts: number }>();
const zonesCache = new Map<string, { data: TableZone[]; ts: number }>();
const settingsCache = new Map<string, { data: GreetingSettings; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isFresh(ts: number): boolean {
  return Date.now() - ts < CACHE_TTL_MS;
}

// ══════════════════════════════════════════════════════════════════════════
// CAMERA CONFIGS
// ══════════════════════════════════════════════════════════════════════════

export async function getActiveCameras(
  venueId: string
): Promise<CameraConfig[]> {
  const cached = configCache.get(venueId);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('camera_configs')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('created_at');

  if (error) {
    console.error('Failed to fetch camera configs:', error.message);
    return [];
  }

  const configs = (data || []).map(normalizeCameraConfig);
  configCache.set(venueId, { data: configs, ts: Date.now() });
  return configs;
}

export async function upsertCameraConfig(
  config: Omit<CameraConfig, 'id' | 'last_polled_at' | 'last_snapshot_hash' | 'snapshot_width' | 'snapshot_height' | 'is_active'> & { id?: string }
): Promise<CameraConfig | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('camera_configs')
    .upsert(
      {
        ...config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id,camera_id' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('Failed to upsert camera config:', error.message);
    return null;
  }

  configCache.delete(config.venue_id);
  return normalizeCameraConfig(data);
}

export async function updateCameraPollingState(
  cameraConfigId: string,
  snapshotHash: string,
  width?: number,
  height?: number
): Promise<void> {
  const supabase = getServiceClient();
  const update: Record<string, any> = {
    last_polled_at: new Date().toISOString(),
    last_snapshot_hash: snapshotHash,
    updated_at: new Date().toISOString(),
  };
  if (width) update.snapshot_width = width;
  if (height) update.snapshot_height = height;

  await (supabase as any)
    .from('camera_configs')
    .update(update)
    .eq('id', cameraConfigId);
}

// ══════════════════════════════════════════════════════════════════════════
// TABLE ZONES
// ══════════════════════════════════════════════════════════════════════════

export async function getActiveZones(
  cameraConfigId: string
): Promise<TableZone[]> {
  const cached = zonesCache.get(cameraConfigId);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('table_zones')
    .select('*')
    .eq('camera_config_id', cameraConfigId)
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch table zones:', error.message);
    return [];
  }

  const zones = (data || []).map(normalizeTableZone);
  zonesCache.set(cameraConfigId, { data: zones, ts: Date.now() });
  return zones;
}

export async function getActiveZonesForVenue(
  venueId: string
): Promise<TableZone[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('table_zones')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch venue zones:', error.message);
    return [];
  }

  return (data || []).map(normalizeTableZone);
}

export async function upsertTableZone(
  zone: Omit<TableZone, 'id' | 'is_active'> & { id?: string }
): Promise<TableZone | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('table_zones')
    .upsert(
      {
        ...zone,
        polygon: JSON.stringify(zone.polygon),
      },
      { onConflict: 'camera_config_id,table_name,zone_type' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('Failed to upsert table zone:', error.message);
    return null;
  }

  zonesCache.delete(zone.camera_config_id);
  return normalizeTableZone(data);
}

// ══════════════════════════════════════════════════════════════════════════
// GREETING SETTINGS
// ══════════════════════════════════════════════════════════════════════════

export async function getGreetingSettings(
  venueId: string
): Promise<GreetingSettings | null> {
  const cached = settingsCache.get(venueId);
  if (cached && isFresh(cached.ts)) return cached.data;

  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('greeting_settings')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no rows
    console.error('Failed to fetch greeting settings:', error.message);
    return null;
  }

  const settings = normalizeGreetingSettings(data);
  settingsCache.set(venueId, { data: settings, ts: Date.now() });
  return settings;
}

export async function upsertGreetingSettings(
  settings: Partial<GreetingSettings> & { venue_id: string }
): Promise<GreetingSettings | null> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('greeting_settings')
    .upsert(
      {
        ...settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id' }
    )
    .select('*')
    .single();

  if (error) {
    console.error('Failed to upsert greeting settings:', error.message);
    return null;
  }

  settingsCache.delete(settings.venue_id);
  return normalizeGreetingSettings(data);
}

// ══════════════════════════════════════════════════════════════════════════
// GREETING METRICS QUERIES
// ══════════════════════════════════════════════════════════════════════════

export async function getGreetingMetricsByDate(
  venueId: string,
  date: string
): Promise<GreetingMetric[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('greeting_metrics')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .order('seated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch greeting metrics:', error.message);
    return [];
  }

  return (data || []).map(normalizeGreetingMetric);
}

export async function getPendingGreetings(
  venueId: string
): Promise<GreetingMetric[]> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('greeting_metrics')
    .select('*')
    .eq('venue_id', venueId)
    .eq('status', 'waiting')
    .order('seated_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch pending greetings:', error.message);
    return [];
  }

  return (data || []).map(normalizeGreetingMetric);
}

export async function getGreetingStats(
  venueId: string,
  startDate: string,
  endDate: string,
  settings?: GreetingSettings | null
): Promise<GreetingStats> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('greeting_metrics')
    .select('greeting_time_seconds, status')
    .eq('venue_id', venueId)
    .gte('business_date', startDate)
    .lte('business_date', endDate)
    .in('status', ['greeted', 'expired', 'no_greeting']);

  if (error) {
    console.error('Failed to fetch greeting stats:', error.message);
    return emptyStats(venueId, startDate);
  }

  const rows = data || [];
  const greeted = rows.filter(
    (r: any) => r.status === 'greeted' && r.greeting_time_seconds != null
  );
  const times = greeted
    .map((r: any) => r.greeting_time_seconds as number)
    .sort((a: number, b: number) => a - b);

  const targetSec = settings?.target_greeting_seconds ?? 30;
  const warningSec = settings?.warning_greeting_seconds ?? 60;
  const criticalSec = settings?.critical_greeting_seconds ?? 120;

  return {
    venue_id: venueId,
    business_date: startDate,
    total_seatings: rows.length,
    total_greeted: greeted.length,
    total_expired: rows.filter((r: any) => r.status === 'expired').length,
    avg_greeting_seconds: times.length
      ? Math.round(times.reduce((s: number, t: number) => s + t, 0) / times.length)
      : null,
    median_greeting_seconds: times.length ? median(times) : null,
    p90_greeting_seconds: times.length ? percentile(times, 90) : null,
    min_greeting_seconds: times.length ? times[0] : null,
    max_greeting_seconds: times.length ? times[times.length - 1] : null,
    pct_within_target: times.length
      ? Math.round(
          (times.filter((t: number) => t <= targetSec).length / times.length) * 100
        )
      : null,
    pct_warning: times.length
      ? Math.round(
          (times.filter((t: number) => t > warningSec).length / times.length) * 100
        )
      : null,
    pct_critical: times.length
      ? Math.round(
          (times.filter((t: number) => t > criticalSec).length / times.length) * 100
        )
      : null,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// ACTIVE VENUES (for polling service)
// ══════════════════════════════════════════════════════════════════════════

export async function getActiveGreetingVenues(): Promise<
  { venue_id: string; polling_interval_seconds: number }[]
> {
  const supabase = getServiceClient();
  const { data, error } = await (supabase as any)
    .from('greeting_settings')
    .select('venue_id, polling_interval_seconds')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch active greeting venues:', error.message);
    return [];
  }

  return data || [];
}

// ══════════════════════════════════════════════════════════════════════════
// NORMALIZERS
// ══════════════════════════════════════════════════════════════════════════

function normalizeCameraConfig(row: any): CameraConfig {
  return {
    id: row.id,
    venue_id: row.venue_id,
    camera_id: row.camera_id,
    camera_name: row.camera_name,
    host_id: row.host_id,
    snapshot_width: row.snapshot_width,
    snapshot_height: row.snapshot_height,
    last_polled_at: row.last_polled_at,
    last_snapshot_hash: row.last_snapshot_hash,
    service_start_hour: row.service_start_hour,
    service_end_hour: row.service_end_hour,
    is_active: row.is_active,
  };
}

function normalizeTableZone(row: any): TableZone {
  let polygon: PolygonVertex[] = [];
  if (Array.isArray(row.polygon)) {
    polygon = row.polygon;
  } else if (typeof row.polygon === 'string') {
    try {
      polygon = JSON.parse(row.polygon);
    } catch {
      polygon = [];
    }
  }

  return {
    id: row.id,
    venue_id: row.venue_id,
    camera_config_id: row.camera_config_id,
    table_name: row.table_name,
    zone_type: row.zone_type,
    polygon,
    label: row.label,
    is_active: row.is_active,
  };
}

function normalizeGreetingSettings(row: any): GreetingSettings {
  return {
    id: row.id,
    venue_id: row.venue_id,
    target_greeting_seconds: row.target_greeting_seconds,
    warning_greeting_seconds: row.warning_greeting_seconds,
    critical_greeting_seconds: row.critical_greeting_seconds,
    expire_after_seconds: row.expire_after_seconds,
    polling_interval_seconds: row.polling_interval_seconds,
    scene_change_threshold: parseFloat(row.scene_change_threshold),
    vision_model: row.vision_model,
    vision_max_tokens: row.vision_max_tokens,
    is_active: row.is_active,
  };
}

function normalizeGreetingMetric(row: any): GreetingMetric {
  return {
    id: row.id,
    venue_id: row.venue_id,
    table_name: row.table_name,
    business_date: row.business_date,
    seated_at: row.seated_at,
    greeted_at: row.greeted_at,
    greeting_time_seconds: row.greeting_time_seconds,
    seated_event_id: row.seated_event_id,
    greeted_event_id: row.greeted_event_id,
    seat_zone_id: row.seat_zone_id,
    approach_zone_id: row.approach_zone_id,
    status: row.status,
  };
}

function emptyStats(venueId: string, date: string): GreetingStats {
  return {
    venue_id: venueId,
    business_date: date,
    total_seatings: 0,
    total_greeted: 0,
    total_expired: 0,
    avg_greeting_seconds: null,
    median_greeting_seconds: null,
    p90_greeting_seconds: null,
    min_greeting_seconds: null,
    max_greeting_seconds: null,
    pct_within_target: null,
    pct_warning: null,
    pct_critical: null,
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
