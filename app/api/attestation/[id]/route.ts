// GET /api/attestation/[id]  — get single attestation with children
// PUT /api/attestation/[id]  — update attestation fields (draft only)

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { updateAttestationSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    const { data: attestation, error } = await (supabase as any)
      .from('nightly_attestations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !attestation) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }

    // Fetch children in parallel
    const [compRes, incidents, coaching] = await Promise.all([
      (supabase as any)
        .from('comp_resolutions')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
      (supabase as any)
        .from('nightly_incidents')
        .select('*')
        .eq('attestation_id', id)
        .order('created_at', { ascending: true }),
      (supabase as any)
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
  } catch (err: any) {
    console.error('[Attestation GET id]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    // Verify attestation exists and is editable
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('nightly_attestations')
      .select('id, venue_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Attestation not found' }, { status: 404 });
    }

    if (existing.status === 'submitted') {
      return NextResponse.json(
        { error: 'Cannot edit a submitted attestation. Use amendment flow.' },
        { status: 409 },
      );
    }

    const body = await req.json();
    const updates = updateAttestationSchema.parse(body);

    const { data, error } = await (supabase as any)
      .from('nightly_attestations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('[Attestation PUT]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
