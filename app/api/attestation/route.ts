// GET  /api/attestation?venue_id=...&business_date=...  — list attestations
// POST /api/attestation                                 — create draft attestation

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { z } from 'zod';

const createSchema = z.object({
  venue_id: z.string().uuid(),
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const businessDate = searchParams.get('business_date');
    const status = searchParams.get('status');

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    let query = (supabase as any)
      .from('nightly_attestations')
      .select('*')
      .eq('venue_id', venueId)
      .order('business_date', { ascending: false });

    if (businessDate) {
      query = query.eq('business_date', businessDate);
    }

    if (status && ['draft', 'submitted', 'amended'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error('[Attestation GET]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { venue_id, business_date } = createSchema.parse(body);

    const supabase = getServiceClient();

    // Check for existing attestation on this date
    const { data: existing } = await (supabase as any)
      .from('nightly_attestations')
      .select('id, status')
      .eq('venue_id', venue_id)
      .eq('business_date', business_date)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        data: existing,
        message: 'Attestation already exists for this date',
      });
    }

    const { data, error } = await (supabase as any)
      .from('nightly_attestations')
      .insert({
        venue_id,
        business_date,
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    console.error('[Attestation POST]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
