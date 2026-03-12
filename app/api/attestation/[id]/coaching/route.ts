// GET  /api/attestation/[id]/coaching  — list coaching actions
// POST /api/attestation/[id]/coaching  — create coaching action

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { coachingSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { id } = await ctx.params;
    const supabase = getServiceClient();
    const { data: attestation } = await (supabase as any)
      .from('nightly_attestations')
      .select('venue_id')
      .eq('id', id)
      .single();
    if (!attestation) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }
    assertVenueAccess(attestation.venue_id, venueIds);

    const { data, error } = await (supabase as any)
      .from('coaching_actions')
      .select('*')
      .eq('attestation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef', 'onboarding', 'readonly', 'viewer']);
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    // Verify attestation exists and is editable
    const { data: attestation, error: fetchError } = await (supabase as any)
      .from('nightly_attestations')
      .select('venue_id, business_date, status')
      .eq('id', id)
      .single();

    if (fetchError || !attestation) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }
    assertVenueAccess(attestation.venue_id, venueIds);

    if (attestation.status === 'submitted') {
      return NextResponse.json(
        { error: 'Attestation is locked' },
        { status: 409 },
      );
    }

    const body = await req.json();
    const validated = coachingSchema.parse(body);

    const { data, error } = await (supabase as any)
      .from('coaching_actions')
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
