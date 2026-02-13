/**
 * Shared types for the camera vision pipeline.
 *
 * Architecture: UniFi Protect snapshots → Claude Vision person detection →
 * custom polygon zone correlation → greeting time metrics.
 */

// ══════════════════════════════════════════════════════════════════════════
// CAMERA & ZONE CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════

export interface CameraConfig {
  id: string;
  venue_id: string;
  camera_id: string;
  camera_name: string | null;
  host_id: string;
  snapshot_width: number | null;
  snapshot_height: number | null;
  last_polled_at: string | null;
  last_snapshot_hash: string | null;
  service_start_hour: number;
  service_end_hour: number;
  is_active: boolean;
}

/** Normalized polygon vertex [x, y] where x,y are 0.0-1.0 */
export type PolygonVertex = [number, number];

export interface TableZone {
  id: string;
  venue_id: string;
  camera_config_id: string;
  table_name: string;
  zone_type: 'seat' | 'approach';
  polygon: PolygonVertex[];
  label: string | null;
  is_active: boolean;
}

export interface GreetingSettings {
  id: string;
  venue_id: string;
  target_greeting_seconds: number;
  warning_greeting_seconds: number;
  critical_greeting_seconds: number;
  expire_after_seconds: number;
  polling_interval_seconds: number;
  scene_change_threshold: number;
  vision_model: string;
  vision_max_tokens: number;
  is_active: boolean;
}

// ══════════════════════════════════════════════════════════════════════════
// DETECTION EVENTS
// ══════════════════════════════════════════════════════════════════════════

export type ZoneEventType =
  | 'seat_zone_occupied'
  | 'seat_zone_vacated'
  | 'approach_zone_staff_present'
  | 'approach_zone_cleared';

export interface ZoneEvent {
  id: string;
  venue_id: string;
  camera_config_id: string;
  table_zone_id: string;
  event_type: ZoneEventType;
  person_count: number;
  confidence: number | null;
  detected_at: string;
  snapshot_hash: string | null;
  raw_detection: Record<string, unknown> | null;
}

// ══════════════════════════════════════════════════════════════════════════
// GREETING METRICS
// ══════════════════════════════════════════════════════════════════════════

export type GreetingStatus = 'waiting' | 'greeted' | 'expired' | 'no_greeting';

export interface GreetingMetric {
  id: string;
  venue_id: string;
  table_name: string;
  business_date: string;
  seated_at: string;
  greeted_at: string | null;
  greeting_time_seconds: number | null;
  seated_event_id: string;
  greeted_event_id: string | null;
  seat_zone_id: string;
  approach_zone_id: string | null;
  status: GreetingStatus;
}

export interface GreetingStats {
  venue_id: string;
  business_date: string;
  total_seatings: number;
  total_greeted: number;
  total_expired: number;
  avg_greeting_seconds: number | null;
  median_greeting_seconds: number | null;
  p90_greeting_seconds: number | null;
  min_greeting_seconds: number | null;
  max_greeting_seconds: number | null;
  pct_within_target: number | null;
  pct_warning: number | null;
  pct_critical: number | null;
}

// ══════════════════════════════════════════════════════════════════════════
// VISION PIPELINE
// ══════════════════════════════════════════════════════════════════════════

/** Result from Claude Vision person detection for a single zone */
export interface ZoneDetection {
  zone_id: string;
  table_name: string;
  zone_type: 'seat' | 'approach';
  person_count: number;
  confidence: number;
  description: string;
}

/** Full result from analyzing one camera snapshot */
export interface SnapshotAnalysis {
  camera_config_id: string;
  snapshot_hash: string;
  detected_at: string;
  zones: ZoneDetection[];
  raw_response: Record<string, unknown>;
}

/** State tracker for a single zone between poll cycles */
export interface ZoneState {
  zone_id: string;
  table_name: string;
  zone_type: 'seat' | 'approach';
  was_occupied: boolean;
  last_person_count: number;
  last_detected_at: string | null;
}

// ══════════════════════════════════════════════════════════════════════════
// UNIFI PROTECT
// ══════════════════════════════════════════════════════════════════════════

export interface UnifiProtectConfig {
  apiKey: string;
  hostId: string;
}

export interface ProtectCamera {
  id: string;
  name: string | null;
  mac: string;
  state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  modelKey: string;
  featureFlags?: {
    hasHdr?: boolean;
    hasMic?: boolean;
    supportFullHdSnapshot?: boolean;
  };
}
