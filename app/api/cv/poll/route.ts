/**
 * Camera Polling Endpoint
 *
 * GET /api/cv/poll — Called by an external scheduler (QStash, cron-job.org, etc.)
 *
 * For each active venue with greeting detection enabled:
 * 1. Fetch snapshot from each active camera via UniFi Cloud Connector
 * 2. Check for scene change (skip if frame is identical)
 * 3. Run Claude Vision person detection on snapshot with zone polygons
 * 4. Process detection results into zone events and greeting metrics
 * 5. Expire stale waiting metrics
 *
 * Auth: x-cron-secret header (matches ETL pattern)
 *
 * Cost note: At 5 cameras × 12 polls/min, ~3600 snapshots/hr.
 * Scene-change detection skips ~60-70% of frames (no movement).
 * Effective cost: ~1000-1500 Claude Vision calls/hr.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveGreetingVenues,
  getActiveCameras,
  getActiveZones,
  getGreetingSettings,
  updateCameraPollingState,
} from '@/lib/database/greeting-metrics';
import type { GreetingSettings } from '@/lib/cv/types';
import { getServiceClient } from '@/lib/supabase/service';
import {
  getCameraSnapshot,
  hasSceneChanged,
} from '@/lib/integrations/unifi-protect';
import { detectPersonsInZones } from '@/lib/cv/person-detector';
import {
  processSnapshotAnalysis,
  expireStaleMetrics,
} from '@/lib/cv/greeting-detector';

const CRON_SECRET = process.env.CRON_SECRET || process.env.CV_CRON_SECRET;
const UNIFI_API_KEY = process.env.UNIFI_PROTECT_API_KEY || '';

function validateCronAuth(request: NextRequest): boolean {
  if (!CRON_SECRET) return true; // dev mode

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;

  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret === CRON_SECRET) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow targeting a specific venue (for testing)
  const targetVenueId = request.nextUrl.searchParams.get('venue_id');

  try {
    const venues = targetVenueId
      ? [{ venue_id: targetVenueId, polling_interval_seconds: 5 }]
      : await getActiveGreetingVenues();

    if (venues.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active venues with greeting detection',
        venues_processed: 0,
      });
    }

    const results = await Promise.allSettled(
      venues.map((v) => processVenue(v.venue_id))
    );

    const summary = results.map((r, i) => ({
      venue_id: venues[i].venue_id,
      status: r.status,
      ...(r.status === 'fulfilled' ? r.value : { error: (r as any).reason?.message }),
    }));

    return NextResponse.json({
      success: true,
      venues_processed: venues.length,
      results: summary,
    });
  } catch (error: any) {
    console.error('Poll error:', error);
    return NextResponse.json(
      { error: error.message || 'Poll failed' },
      { status: 500 }
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PER-VENUE PROCESSING
// ══════════════════════════════════════════════════════════════════════════

async function processVenue(venueId: string): Promise<{
  cameras_processed: number;
  snapshots_analyzed: number;
  snapshots_skipped: number;
  events_created: number;
  metrics_updated: number;
  metrics_expired: number;
  violations_created: number;
}> {
  const settings = await getGreetingSettings(venueId);
  const cameras = await getActiveCameras(venueId);

  let totalAnalyzed = 0;
  let totalSkipped = 0;
  let totalEvents = 0;
  let totalMetrics = 0;

  for (const camera of cameras) {
    // Check service hours
    if (!isWithinServiceHours(camera.service_start_hour, camera.service_end_hour)) {
      totalSkipped++;
      continue;
    }

    try {
      const config = { apiKey: UNIFI_API_KEY, hostId: camera.host_id };

      // 1. Fetch snapshot
      const { buffer, hash, contentType } = await getCameraSnapshot(
        config,
        camera.camera_id
      );

      // 2. Scene change check
      if (!hasSceneChanged(camera.last_snapshot_hash, hash)) {
        totalSkipped++;
        await updateCameraPollingState(camera.id, hash);
        continue;
      }

      // 3. Get zones for this camera
      const zones = await getActiveZones(camera.id);
      if (zones.length === 0) {
        await updateCameraPollingState(camera.id, hash);
        continue;
      }

      // 4. Run Claude Vision detection
      const analysis = await detectPersonsInZones(buffer, contentType, zones, {
        model: settings?.vision_model,
        maxTokens: settings?.vision_max_tokens,
        cameraConfigId: camera.id,
        snapshotHash: hash,
      });

      // 5. Process detections into events and metrics
      const { events_created, metrics_updated } = await processSnapshotAnalysis(
        analysis,
        zones,
        venueId
      );

      totalAnalyzed++;
      totalEvents += events_created;
      totalMetrics += metrics_updated;

      // 6. Update camera polling state
      await updateCameraPollingState(camera.id, hash);
    } catch (error: any) {
      console.error(
        `Failed to process camera ${camera.camera_id} at venue ${venueId}:`,
        error.message
      );
    }
  }

  // 7. Expire stale waiting metrics
  const expireAfter = settings?.expire_after_seconds ?? 600;
  const expired = await expireStaleMetrics(venueId, expireAfter);

  // 8. Enforce greeting delay violations
  let violationsCreated = 0;
  try {
    violationsCreated = await enforceGreetingDelays(venueId, settings);
  } catch (err: any) {
    console.error(`Greeting enforcement failed for venue ${venueId}:`, err.message);
  }

  return {
    cameras_processed: cameras.length,
    snapshots_analyzed: totalAnalyzed,
    snapshots_skipped: totalSkipped,
    events_created: totalEvents,
    metrics_updated: totalMetrics,
    metrics_expired: expired,
    violations_created: violationsCreated,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// SERVICE HOURS CHECK
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check if current time is within service hours.
 * Handles overnight ranges (e.g., 11 PM to 3 AM = start=23, end=3).
 */
function isWithinServiceHours(startHour: number, endHour: number): boolean {
  const now = new Date();
  const currentHour = now.getHours();

  if (startHour <= endHour) {
    // Same-day range (e.g., 11 to 23)
    return currentHour >= startHour && currentHour < endHour;
  } else {
    // Overnight range (e.g., 17 to 3)
    return currentHour >= startHour || currentHour < endHour;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// GREETING DELAY ENFORCEMENT
// ══════════════════════════════════════════════════════════════════════════

/**
 * Check recently-greeted metrics for threshold violations and create
 * enforcement violations. Real-time enforcement during service.
 *
 * Query: greeting_metrics with status='greeted' where greeting_time_seconds
 * exceeds warning threshold and no violation already exists for that metric.
 */
async function enforceGreetingDelays(
  venueId: string,
  settings: GreetingSettings | null,
): Promise<number> {
  if (!settings) return 0;

  const warningThreshold = settings.warning_greeting_seconds ?? 60;
  const supabase = getServiceClient() as any;

  // Find recently-greeted metrics that exceed warning threshold
  // Only look at last 30 minutes to avoid re-processing old data
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: delayedMetrics, error } = await supabase
    .from('greeting_metrics')
    .select('id, venue_id, table_name, business_date, seated_at, greeted_at, greeting_time_seconds')
    .eq('venue_id', venueId)
    .eq('status', 'greeted')
    .gt('greeting_time_seconds', warningThreshold)
    .gte('greeted_at', cutoff);

  if (error || !delayedMetrics || delayedMetrics.length === 0) return 0;

  // Get org_id for this venue
  const { data: venue } = await supabase
    .from('venues')
    .select('organization_id')
    .eq('id', venueId)
    .single();

  if (!venue?.organization_id) return 0;

  let created = 0;

  for (const metric of delayedMetrics) {
    // Dedup: check if violation already exists for this greeting metric
    const { data: existing } = await supabase
      .from('control_plane_violations')
      .select('id')
      .eq('org_id', venue.organization_id)
      .eq('source_id', metric.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    try {
      const delaySec = metric.greeting_time_seconds;
      const criticalThreshold = settings.critical_greeting_seconds ?? 120;
      const severity = delaySec > criticalThreshold ? 'critical' : 'warning';

      const { error: insertError } = await supabase
        .from('control_plane_violations')
        .insert({
          org_id: venue.organization_id,
          venue_id: venueId,
          violation_type: 'greeting_delay',
          severity,
          title: `Table ${metric.table_name} greeting delayed`,
          description: `${Math.floor(delaySec / 60)}min ${delaySec % 60}sec delay (threshold: ${Math.floor(warningThreshold / 60)}min)`,
          metadata: {
            table_number: metric.table_name,
            seated_at: metric.seated_at,
            greeted_at: metric.greeted_at,
            delay_seconds: delaySec,
            threshold_seconds: warningThreshold,
          },
          source_table: 'greeting_metrics',
          source_id: metric.id,
          business_date: metric.business_date,
          status: 'open',
          verification_required: severity === 'critical',
          escalation_level: 0,
          recurrence_count: 0,
          policy_snapshot: {
            type: 'greeting_settings',
            target_greeting_seconds: settings.target_greeting_seconds,
            warning_greeting_seconds: settings.warning_greeting_seconds,
            critical_greeting_seconds: settings.critical_greeting_seconds,
            captured_at: new Date().toISOString(),
          },
          evidence: {
            seated_at: metric.seated_at,
            greeted_at: metric.greeted_at,
            delay_seconds: delaySec,
            table_name: metric.table_name,
          },
          estimated_impact_usd: null,
          impact_confidence: null,
        });

      if (insertError) throw insertError;

      // Insert created event for audit trail
      const { data: violationRow } = await supabase
        .from('control_plane_violations')
        .select('id')
        .eq('org_id', venue.organization_id)
        .eq('source_id', metric.id)
        .limit(1)
        .single();

      if (violationRow) {
        await supabase.from('violation_events').insert({
          violation_id: violationRow.id,
          event_type: 'created',
          to_status: 'open',
          occurred_at: new Date().toISOString(),
          metadata: {
            violation_type: 'greeting_delay',
            severity,
            source: 'cv_poll_realtime',
          },
        });
      }

      created++;
    } catch (err: any) {
      console.error(
        `Greeting violation failed for table ${metric.table_name}:`,
        err.message
      );
    }
  }

  return created;
}
