/**
 * Event Ingestion API
 *
 * POST /api/cv/events — Manually ingest detection events (for testing / replay)
 *
 * The primary event flow goes through the poll endpoint, but this allows
 * manual event injection for testing and debugging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { getServiceClient } from '@/lib/supabase/service';

export async function POST(request: NextRequest) {
  return guard(async () => {
    const body = await request.json();
    const { venue_id, events } = body;

    if (!venue_id || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'venue_id and events[] are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    let inserted = 0;

    for (const event of events) {
      const {
        camera_config_id,
        table_zone_id,
        event_type,
        person_count,
        confidence,
        detected_at,
        snapshot_hash,
        raw_detection,
      } = event;

      if (!camera_config_id || !table_zone_id || !event_type || !detected_at) {
        continue;
      }

      const validTypes = [
        'seat_zone_occupied',
        'seat_zone_vacated',
        'approach_zone_staff_present',
        'approach_zone_cleared',
      ];
      if (!validTypes.includes(event_type)) continue;

      const { error } = await (supabase as any).from('zone_events').insert({
        venue_id,
        camera_config_id,
        table_zone_id,
        event_type,
        person_count: person_count ?? 0,
        confidence: confidence ?? null,
        detected_at,
        snapshot_hash: snapshot_hash ?? null,
        raw_detection: raw_detection ?? null,
      });

      if (!error) inserted++;
    }

    return NextResponse.json({
      success: true,
      inserted,
      total: events.length,
    });
  });
}
