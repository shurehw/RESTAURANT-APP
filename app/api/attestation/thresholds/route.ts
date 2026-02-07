// GET /api/attestation/thresholds?venue_id=...  — get thresholds
// PUT /api/attestation/thresholds               — upsert thresholds

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { attestationThresholdsSchema } from '@/lib/attestation/types';
import { DEFAULT_THRESHOLDS } from '@/lib/attestation/triggers';
import { z } from 'zod';

const upsertSchema = attestationThresholdsSchema.extend({
  venue_id: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const venueId = req.nextUrl.searchParams.get('venue_id');
    if (!venueId) {
      throw { status: 400, code: 'MISSING_VENUE', message: 'venue_id is required' };
    }
    assertVenueAccess(venueId, venueIds);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('attestation_thresholds')
      .select('*')
      .eq('venue_id', venueId)
      .maybeSingle();

    if (error) throw error;

    // Return stored thresholds or defaults
    return NextResponse.json({
      success: true,
      data: data || { venue_id: venueId, ...DEFAULT_THRESHOLDS },
      is_default: !data,
    });
  });
}

export async function PUT(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await req.json();
    const { venue_id, ...thresholds } = upsertSchema.parse(body);
    assertVenueAccess(venue_id, venueIds);

    const supabase = await createClient();

    const { data, error } = await supabase
      .from('attestation_thresholds')
      .upsert(
        { venue_id, ...thresholds },
        { onConflict: 'venue_id' },
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  });
}
