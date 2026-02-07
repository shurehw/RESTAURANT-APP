// GET /api/attestation/[id]  — get single attestation with children
// PUT /api/attestation/[id]  — update attestation fields (draft only)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { updateAttestationSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const { id } = await ctx.params;
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const supabase = await createClient();

    const { data: attestation, error } = await supabase
      .from('nightly_attestations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !attestation) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Attestation not found' };
    }

    assertVenueAccess(attestation.venue_id, venueIds);

    // Fetch children in parallel
    const [compRes, incidents, coaching] = await Promise.all([
      supabase
        .from('comp_resolutions')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('nightly_incidents')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('coaching_actions')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        attestation,
        comp_resolutions: compRes.data || [],
        incidents: incidents.data || [],
        coaching_actions: coaching.data || [],
      },
    });
  });
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const { id } = await ctx.params;
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const supabase = await createClient();

    // Verify attestation exists and is editable
    const { data: existing, error: fetchError } = await supabase
      .from('nightly_attestations')
      .select('id, venue_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Attestation not found' };
    }

    assertVenueAccess(existing.venue_id, venueIds);

    if (existing.status === 'submitted') {
      throw {
        status: 409,
        code: 'ALREADY_SUBMITTED',
        message: 'Cannot edit a submitted attestation. Use amendment flow.',
      };
    }

    const body = await req.json();
    const updates = updateAttestationSchema.parse(body);

    const { data, error } = await supabase
      .from('nightly_attestations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  });
}
