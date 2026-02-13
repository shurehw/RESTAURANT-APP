/**
 * Camera & Zone Configuration API
 *
 * GET  /api/cv/config?venue_id=xxx — List cameras and zone mappings
 * PUT  /api/cv/config — Upsert camera config or table zone
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import {
  getActiveCameras,
  getActiveZonesForVenue,
  getGreetingSettings,
  upsertCameraConfig,
  upsertTableZone,
  upsertGreetingSettings,
} from '@/lib/database/greeting-metrics';

export async function GET(request: NextRequest) {
  return guard(async () => {
    const venueId = request.nextUrl.searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }

    const [cameras, zones, settings] = await Promise.all([
      getActiveCameras(venueId),
      getActiveZonesForVenue(venueId),
      getGreetingSettings(venueId),
    ]);

    return NextResponse.json({
      success: true,
      data: { cameras, zones, settings },
    });
  });
}

export async function PUT(request: NextRequest) {
  return guard(async () => {
    const body = await request.json();
    const { type } = body;

    if (type === 'camera') {
      const { venue_id, camera_id, camera_name, host_id, service_start_hour, service_end_hour } = body;
      if (!venue_id || !camera_id || !host_id) {
        return NextResponse.json(
          { error: 'venue_id, camera_id, and host_id are required' },
          { status: 400 }
        );
      }

      const config = await upsertCameraConfig({
        venue_id,
        camera_id,
        camera_name: camera_name || null,
        host_id,
        service_start_hour: service_start_hour ?? 11,
        service_end_hour: service_end_hour ?? 3,
      });

      return NextResponse.json({ success: true, data: config });
    }

    if (type === 'zone') {
      const { venue_id, camera_config_id, table_name, zone_type, polygon, label } = body;
      if (!venue_id || !camera_config_id || !table_name || !zone_type || !polygon) {
        return NextResponse.json(
          { error: 'venue_id, camera_config_id, table_name, zone_type, and polygon are required' },
          { status: 400 }
        );
      }

      if (!Array.isArray(polygon) || polygon.length < 3) {
        return NextResponse.json(
          { error: 'polygon must be an array of at least 3 [x,y] vertices' },
          { status: 400 }
        );
      }

      const zone = await upsertTableZone({
        venue_id,
        camera_config_id,
        table_name,
        zone_type,
        polygon,
        label: label || null,
      });

      return NextResponse.json({ success: true, data: zone });
    }

    if (type === 'settings') {
      const { venue_id, ...settingsData } = body;
      if (!venue_id) {
        return NextResponse.json(
          { error: 'venue_id is required' },
          { status: 400 }
        );
      }

      const settings = await upsertGreetingSettings({
        venue_id,
        ...settingsData,
      });

      return NextResponse.json({ success: true, data: settings });
    }

    return NextResponse.json(
      { error: 'type must be "camera", "zone", or "settings"' },
      { status: 400 }
    );
  });
}
