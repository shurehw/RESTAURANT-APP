/**
 * Anomaly Flagging API
 * GET    /api/forecast/anomalies - List anomalies for a venue
 * POST   /api/forecast/anomalies - Manually flag a day as anomaly
 * PATCH  /api/forecast/anomalies - Resolve (un-flag) an anomaly
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const querySchema = z.object({
  venueId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeResolved: z.string().optional(),
});

const flagSchema = z.object({
  venueId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  anomalyType: z.enum(['buyout', 'private_event', 'soft_closure', 'data_glitch', 'other']),
  notes: z.string().max(500).optional(),
});

const resolveSchema = z.object({
  id: z.string().uuid(),
});

/**
 * GET /api/forecast/anomalies?venueId=...&startDate=...&endDate=...
 */
export async function GET(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-anomalies-get');
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const params = querySchema.parse(searchParams);

    assertVenueAccess(params.venueId, venueIds);

    const supabase = await createClient();

    let query = (supabase as any)
      .from('venue_day_anomalies')
      .select('*')
      .eq('venue_id', params.venueId)
      .order('business_date', { ascending: false });

    if (params.startDate) query = query.gte('business_date', params.startDate);
    if (params.endDate) query = query.lte('business_date', params.endDate);
    if (params.includeResolved !== 'true') query = query.is('resolved_at', null);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ anomalies: data });
  });
}

/**
 * POST /api/forecast/anomalies
 * Manually flag a day as a buyout/private event/etc.
 */
export async function POST(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-anomalies-flag');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    const body = await req.json();
    const params = flagSchema.parse(body);

    assertVenueAccess(params.venueId, venueIds);
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    // Look up actual covers for context
    const { data: fact } = await (supabase as any)
      .from('venue_day_facts')
      .select('covers_count')
      .eq('venue_id', params.venueId)
      .eq('business_date', params.businessDate)
      .maybeSingle();

    const { data: anomaly, error } = await (supabase as any)
      .from('venue_day_anomalies')
      .upsert({
        venue_id: params.venueId,
        business_date: params.businessDate,
        anomaly_type: params.anomalyType,
        detection_method: 'manual',
        actual_covers: fact?.covers_count ?? null,
        notes: params.notes || null,
        flagged_by: user.id,
        resolved_at: null,
      }, {
        onConflict: 'venue_id,business_date',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ anomaly, message: 'Day flagged as anomaly' });
  });
}

/**
 * PATCH /api/forecast/anomalies
 * Resolve (un-flag) an anomaly
 */
export async function PATCH(req: NextRequest) {
  return guard(async () => {
    rateLimit(req, ':forecast-anomalies-resolve');
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);

    const body = await req.json();
    const params = resolveSchema.parse(body);

    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    // Verify the anomaly belongs to a venue the user has access to
    const { data: existing } = await (supabase as any)
      .from('venue_day_anomalies')
      .select('venue_id')
      .eq('id', params.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    assertVenueAccess(existing.venue_id, venueIds);

    const { data: anomaly, error } = await (supabase as any)
      .from('venue_day_anomalies')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ anomaly, message: 'Anomaly resolved' });
  });
}
