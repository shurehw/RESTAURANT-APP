// GET  /api/attestation/[id]/comp-resolutions  — list resolutions
// POST /api/attestation/[id]/comp-resolutions  — create resolution

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { compResolutionSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const { id } = await ctx.params;
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const supabase = await createClient();

    // Verify attestation access
    const { data: attestation } = await supabase
      .from('nightly_attestations')
      .select('venue_id')
      .eq('id', id)
      .single();

    if (!attestation) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Attestation not found' };
    }
    assertVenueAccess(attestation.venue_id, venueIds);

    const { data, error } = await supabase
      .from('comp_resolutions')
      .select('*')
      .eq('attestation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const { id } = await ctx.params;
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    const { data: attestation } = await supabase
      .from('nightly_attestations')
      .select('venue_id, business_date, status')
      .eq('id', id)
      .single();

    if (!attestation) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Attestation not found' };
    }
    assertVenueAccess(attestation.venue_id, venueIds);

    if (attestation.status === 'submitted') {
      throw { status: 409, code: 'LOCKED', message: 'Attestation is locked' };
    }

    const body = await req.json();
    const validated = compResolutionSchema.parse(body);

    const { data, error } = await supabase
      .from('comp_resolutions')
      .insert({
        ...validated,
        attestation_id: id,
        venue_id: attestation.venue_id,
        business_date: attestation.business_date,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  });
}
