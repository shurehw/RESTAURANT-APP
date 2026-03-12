// GET  /api/attestation/[id]/comp-resolutions  — list resolutions
// POST /api/attestation/[id]/comp-resolutions  — create/upsert resolution (FOH or BOH)

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { compResolutionSchema, bohCompResolutionSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return guard(async () => {
    const { id } = await ctx.params;
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const supabase = getServiceClient() as any;

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
    assertRole(role, ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef', 'onboarding', 'readonly', 'viewer']);

    const supabase = getServiceClient() as any;

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

    // Detect BOH mode: boh_notes present, resolution_code absent
    const isBOHMode = body.boh_notes && !body.resolution_code;

    if (isBOHMode) {
      // BOH path: kitchen context notes only
      const validated = bohCompResolutionSchema.parse(body);

      // Check for existing record (FOH may have resolved first)
      const { data: existing } = await supabase
        .from('comp_resolutions')
        .select('id')
        .eq('attestation_id', id)
        .eq('check_id', validated.check_id)
        .maybeSingle();

      let data;
      if (existing) {
        // Update existing record with BOH notes
        const { data: updated, error } = await supabase
          .from('comp_resolutions')
          .update({ boh_notes: validated.boh_notes })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        data = updated;
      } else {
        // Create stub with sentinel resolution_code
        const { data: inserted, error } = await supabase
          .from('comp_resolutions')
          .insert({
            check_id: validated.check_id,
            check_amount: validated.check_amount,
            comp_amount: validated.comp_amount,
            comp_reason_pos: validated.comp_reason_pos,
            employee_name: validated.employee_name,
            boh_notes: validated.boh_notes,
            resolution_code: 'pending_foh_resolution',
            requires_follow_up: false,
            attestation_id: id,
            venue_id: attestation.venue_id,
            business_date: attestation.business_date,
          })
          .select()
          .single();
        if (error) throw error;
        data = inserted;
      }

      return NextResponse.json({ success: true, data }, { status: existing ? 200 : 201 });
    }

    // FOH path: full resolution
    const validated = compResolutionSchema.parse(body);

    // Check for existing record (BOH may have added notes first)
    const { data: existing } = await supabase
      .from('comp_resolutions')
      .select('id')
      .eq('attestation_id', id)
      .eq('check_id', validated.check_id ?? '')
      .maybeSingle();

    let data;
    if (existing) {
      // Update existing record (preserves boh_notes)
      const { data: updated, error } = await supabase
        .from('comp_resolutions')
        .update({
          ...validated,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      data = updated;
    } else {
      const { data: inserted, error } = await supabase
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
      data = inserted;
    }

    return NextResponse.json({ success: true, data }, { status: existing ? 200 : 201 });
  });
}
