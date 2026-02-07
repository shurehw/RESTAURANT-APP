// GET /api/attestation/thresholds?venue_id=...  — get thresholds
// PUT /api/attestation/thresholds               — upsert thresholds

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';
import { attestationThresholdsSchema } from '@/lib/attestation/types';
import { DEFAULT_THRESHOLDS } from '@/lib/attestation/triggers';
import { z } from 'zod';

const upsertSchema = attestationThresholdsSchema.extend({
  venue_id: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  try {
    const venueId = req.nextUrl.searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await (supabase as any)
      .from('attestation_thresholds')
      .select('*')
      .eq('venue_id', venueId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || { venue_id: venueId, ...DEFAULT_THRESHOLDS },
      is_default: !data,
    });
  } catch (err: any) {
    console.error('[Attestation thresholds GET]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { venue_id, ...thresholds } = upsertSchema.parse(body);

    const supabase = getServiceClient();

    const { data, error } = await (supabase as any)
      .from('attestation_thresholds')
      .upsert(
        { venue_id, ...thresholds },
        { onConflict: 'venue_id' },
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error('[Attestation thresholds PUT]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
