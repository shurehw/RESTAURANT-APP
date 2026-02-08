// GET  /api/attestation/[id]/coaching  — list coaching actions
// POST /api/attestation/[id]/coaching  — create coaching action

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { coachingSchema } from '@/lib/attestation/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = getServiceClient();

    const { data, error } = await (supabase as any)
      .from('coaching_actions')
      .select('*')
      .eq('attestation_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[Attestation coaching GET]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
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
  } catch (err: any) {
    console.error('[Attestation coaching POST]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
