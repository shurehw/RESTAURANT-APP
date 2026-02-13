/**
 * Greeting Detector — Correlates zone detection events into greeting metrics.
 *
 * Flow:
 * 1. Person detector reports zone occupancy per snapshot
 * 2. This module compares to previous state to detect transitions
 * 3. Transitions emit zone_events:
 *    - seat_zone: empty → occupied = new seating
 *    - approach_zone: empty → occupied = potential greeting
 * 4. Correlator matches seat events to approach events for the same table
 * 5. Computes greeting_time_seconds and updates greeting_metrics
 */

import { getServiceClient } from '@/lib/supabase/service';
import type {
  SnapshotAnalysis,
  ZoneDetection,
  ZoneEvent,
  ZoneState,
  ZoneEventType,
  TableZone,
} from './types';

// In-memory zone state per camera (reset on cold start — acceptable for MVP)
const zoneStates = new Map<string, ZoneState>();

// ══════════════════════════════════════════════════════════════════════════
// MAIN PROCESSING PIPELINE
// ══════════════════════════════════════════════════════════════════════════

/**
 * Process a snapshot analysis result: detect transitions, emit events,
 * correlate greetings.
 */
export async function processSnapshotAnalysis(
  analysis: SnapshotAnalysis,
  zones: TableZone[],
  venueId: string
): Promise<{ events_created: number; metrics_updated: number }> {
  const supabase = getServiceClient();
  let eventsCreated = 0;
  let metricsUpdated = 0;

  for (const detection of analysis.zones) {
    const zone = zones.find((z) => z.id === detection.zone_id);
    if (!zone) continue;

    const stateKey = `${analysis.camera_config_id}:${detection.zone_id}`;
    const previousState = zoneStates.get(stateKey);
    const wasOccupied = previousState?.was_occupied ?? false;
    const isOccupied = detection.person_count > 0;

    // Detect transitions
    const eventType = getTransitionEventType(
      zone.zone_type,
      wasOccupied,
      isOccupied
    );

    if (eventType) {
      // Insert zone event
      const { data: event, error } = await (supabase as any)
        .from('zone_events')
        .insert({
          venue_id: venueId,
          camera_config_id: analysis.camera_config_id,
          table_zone_id: detection.zone_id,
          event_type: eventType,
          person_count: detection.person_count,
          confidence: detection.confidence,
          detected_at: analysis.detected_at,
          snapshot_hash: analysis.snapshot_hash,
          raw_detection: detection,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Failed to insert zone event:', error.message);
      } else {
        eventsCreated++;

        // Handle greeting correlation
        if (eventType === 'seat_zone_occupied') {
          const created = await createWaitingMetric(
            supabase,
            venueId,
            zone,
            event.id,
            analysis.detected_at
          );
          if (created) metricsUpdated++;
        } else if (eventType === 'approach_zone_staff_present') {
          const resolved = await resolveWaitingMetric(
            supabase,
            venueId,
            zone,
            event.id,
            analysis.detected_at
          );
          if (resolved) metricsUpdated++;
        }
      }
    }

    // Update zone state
    zoneStates.set(stateKey, {
      zone_id: detection.zone_id,
      table_name: zone.table_name,
      zone_type: zone.zone_type,
      was_occupied: isOccupied,
      last_person_count: detection.person_count,
      last_detected_at: analysis.detected_at,
    });
  }

  return { events_created: eventsCreated, metrics_updated: metricsUpdated };
}

/**
 * Expire stale waiting metrics that exceeded the timeout.
 */
export async function expireStaleMetrics(
  venueId: string,
  expireAfterSeconds: number
): Promise<number> {
  const supabase = getServiceClient();
  const cutoff = new Date(
    Date.now() - expireAfterSeconds * 1000
  ).toISOString();

  const { data, error } = await (supabase as any)
    .from('greeting_metrics')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('venue_id', venueId)
    .eq('status', 'waiting')
    .lt('seated_at', cutoff)
    .select('id');

  if (error) {
    console.error('Failed to expire stale metrics:', error.message);
    return 0;
  }

  return data?.length || 0;
}

// ══════════════════════════════════════════════════════════════════════════
// TRANSITION DETECTION
// ══════════════════════════════════════════════════════════════════════════

function getTransitionEventType(
  zoneType: 'seat' | 'approach',
  wasOccupied: boolean,
  isOccupied: boolean
): ZoneEventType | null {
  if (wasOccupied === isOccupied) return null;

  if (zoneType === 'seat') {
    return isOccupied ? 'seat_zone_occupied' : 'seat_zone_vacated';
  } else {
    return isOccupied ? 'approach_zone_staff_present' : 'approach_zone_cleared';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// GREETING METRIC LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════

async function createWaitingMetric(
  supabase: any,
  venueId: string,
  zone: TableZone,
  eventId: string,
  detectedAt: string
): Promise<boolean> {
  // Check if there's already a 'waiting' metric for this table
  const { data: existing } = await supabase
    .from('greeting_metrics')
    .select('id')
    .eq('venue_id', venueId)
    .eq('table_name', zone.table_name)
    .eq('status', 'waiting')
    .limit(1);

  if (existing && existing.length > 0) return false;

  const businessDate = toBusinessDate(detectedAt);

  const { error } = await supabase.from('greeting_metrics').insert({
    venue_id: venueId,
    table_name: zone.table_name,
    business_date: businessDate,
    seated_at: detectedAt,
    seated_event_id: eventId,
    seat_zone_id: zone.id,
    status: 'waiting',
  });

  if (error) {
    console.error('Failed to create greeting metric:', error.message);
    return false;
  }
  return true;
}

async function resolveWaitingMetric(
  supabase: any,
  venueId: string,
  zone: TableZone,
  eventId: string,
  detectedAt: string
): Promise<boolean> {
  // Find the oldest 'waiting' metric for this table
  const { data: waiting } = await supabase
    .from('greeting_metrics')
    .select('id, seated_at')
    .eq('venue_id', venueId)
    .eq('table_name', zone.table_name)
    .eq('status', 'waiting')
    .order('seated_at', { ascending: true })
    .limit(1);

  if (!waiting || waiting.length === 0) return false;

  const metric = waiting[0];
  const seatedAt = new Date(metric.seated_at).getTime();
  const greetedAt = new Date(detectedAt).getTime();
  const greetingTimeSeconds = Math.round((greetedAt - seatedAt) / 1000);

  // Find the approach zone for this table
  const { data: approachZone } = await supabase
    .from('table_zones')
    .select('id')
    .eq('camera_config_id', zone.camera_config_id)
    .eq('table_name', zone.table_name)
    .eq('zone_type', 'approach')
    .eq('is_active', true)
    .limit(1);

  const { error } = await supabase
    .from('greeting_metrics')
    .update({
      greeted_at: detectedAt,
      greeting_time_seconds: greetingTimeSeconds,
      greeted_event_id: eventId,
      approach_zone_id: approachZone?.[0]?.id || zone.id,
      status: 'greeted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', metric.id);

  if (error) {
    console.error('Failed to resolve greeting metric:', error.message);
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Convert a timestamp to business date.
 * Restaurant business dates typically end at 4-5 AM.
 * If the time is before 5 AM, it belongs to the previous business day.
 */
function toBusinessDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (date.getHours() < 5) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString().split('T')[0];
}
