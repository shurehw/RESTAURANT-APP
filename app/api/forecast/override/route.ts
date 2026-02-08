/**
 * Forecast Override API
 * POST /api/forecast/override - Submit a manager override
 * GET  /api/forecast/override - Get overrides for a venue/date range
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const overrideSchema = z.object({
  venueId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftType: z.string().default('dinner'),
  forecastPreOverride: z.number().int().min(0),
  forecastPostOverride: z.number().int().min(0),
  reasonCode: z.enum([
    'PRIVATE_EVENT', 'PROMO_MARKETING', 'WEATHER', 'VIP_GROUP',
    'BUYOUT', 'LOCAL_EVENT', 'HOLIDAY_BEHAVIOR', 'MANAGER_GUT', 'OTHER',
  ]),
  reasonText: z.string().max(500).optional(),
});

const querySchema = z.object({
  venueId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/forecast/override
 * Submit a manager override with reason code and layer snapshot
 */
export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-override');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    const body = await req.json();
    const params = overrideSchema.parse(body);

    assertVenueAccess(params.venueId, venueIds);
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    // 1. Snapshot current layer outputs
    const { data: forecast } = await supabase
      .from('forecasts_with_bias')
      .select('*')
      .eq('venue_id', params.venueId)
      .eq('business_date', params.businessDate)
      .eq('shift_type', params.shiftType)
      .maybeSingle();

    let layerOutputId: string | null = null;

    if (forecast) {
      const { data: layerOutput } = await supabase
        .from('forecast_layer_outputs')
        .insert({
          venue_id: params.venueId,
          business_date: params.businessDate,
          shift_type: params.shiftType,
          base_forecast: forecast.covers_raw,
          day_type_offset: forecast.day_type_offset || 0,
          holiday_offset: forecast.holiday_offset || 0,
          pacing_multiplier: forecast.pacing_multiplier || 1.0,
          final_forecast: forecast.covers_predicted,
          day_type: forecast.day_type,
          holiday_code: forecast.holiday_code,
          venue_class: forecast.venue_class,
          model_version: forecast.model_version,
          on_hand_resos: forecast.on_hand_resos,
          typical_on_hand_resos: forecast.typical_resos,
          pace_ratio: forecast.on_hand_resos && forecast.typical_resos
            ? forecast.on_hand_resos / forecast.typical_resos
            : null,
        })
        .select('id')
        .single();

      layerOutputId = layerOutput?.id || null;
    }

    // 2. Upsert the override
    const { data: override, error } = await supabase
      .from('forecast_overrides')
      .upsert({
        venue_id: params.venueId,
        business_date: params.businessDate,
        shift_type: params.shiftType,
        forecast_pre_override: params.forecastPreOverride,
        forecast_post_override: params.forecastPostOverride,
        reason_code: params.reasonCode,
        reason_text: params.reasonText || null,
        overridden_by: user.id,
        overridden_at: new Date().toISOString(),
        layer_output_id: layerOutputId,
      }, {
        onConflict: 'venue_id,business_date,shift_type',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      override,
      layer_output_id: layerOutputId,
      message: 'Override saved',
    });
  });
}

/**
 * GET /api/forecast/override?venueId=...&startDate=...&endDate=...
 * Get overrides for a venue with optional date range
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-override-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const params = querySchema.parse(searchParams);

    assertVenueAccess(params.venueId, venueIds);

    const supabase = await createClient();

    let query = supabase
      .from('forecast_overrides')
      .select('*, layer_outputs:forecast_layer_outputs(*)')
      .eq('venue_id', params.venueId)
      .order('business_date', { ascending: false });

    if (params.startDate) query = query.gte('business_date', params.startDate);
    if (params.endDate) query = query.lte('business_date', params.endDate);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ overrides: data });
  });
}
