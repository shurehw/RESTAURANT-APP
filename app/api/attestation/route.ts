// GET  /api/attestation?venue_id=...&business_date=...  — list attestations
// POST /api/attestation                                 — create draft attestation

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess, assertRole } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';
import { z } from 'zod';

const createSchema = z.object({
  venue_id: z.string().uuid(),
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const searchParams = req.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const businessDate = searchParams.get('business_date');
    const status = searchParams.get('status');

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

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
  });
}

export async function POST(req: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds, role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'director', 'gm', 'agm', 'manager', 'exec_chef', 'sous_chef']);
    const body = await req.json();
    const { venue_id, business_date } = createSchema.parse(body);
    assertVenueAccess(venue_id, venueIds);

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
  });
}
