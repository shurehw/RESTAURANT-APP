/**
 * Table Combo API
 *
 * GET  /api/floor-plan/live/combos?venue_id&date
 *   Returns active combos for the date. Each combo includes
 *   primary_table_id and combined_table_ids.
 *
 * POST /api/floor-plan/live/combos
 *   Body: { venue_id, date, primary_table_id, secondary_table_ids[] }
 *   Creates a combo. All listed tables must be available.
 *
 * DELETE /api/floor-plan/live/combos
 *   Body: { combo_id }
 *   Releases (soft-deletes) a combo.
 */

import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';

// ── GET ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get('venue_id');
    const date = searchParams.get('date');

    if (!venue_id || !date) {
      return NextResponse.json({ error: 'venue_id and date required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const supabase = getServiceClient();
    const { data: combos } = await (supabase as any)
      .from('table_combos')
      .select('id, primary_table_id, combined_table_ids, party_size, reservation_id')
      .eq('venue_id', venue_id)
      .eq('business_date', date)
      .eq('status', 'active');

    return NextResponse.json({ combos: combos || [] });
  });
}

// ── POST ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, date, primary_table_id, secondary_table_ids } = body;

    if (!venue_id || !date || !primary_table_id || !secondary_table_ids?.length) {
      return NextResponse.json(
        { error: 'venue_id, date, primary_table_id, secondary_table_ids required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    const uniqueSecondaryIds = Array.from(new Set(secondary_table_ids as string[]));
    if (uniqueSecondaryIds.includes(primary_table_id)) {
      return NextResponse.json(
        { error: 'primary_table_id cannot also appear in secondary_table_ids' },
        { status: 400 },
      );
    }
    if (uniqueSecondaryIds.length !== secondary_table_ids.length) {
      return NextResponse.json(
        { error: 'secondary_table_ids contains duplicates' },
        { status: 400 },
      );
    }

    const allTableIds: string[] = [primary_table_id, ...uniqueSecondaryIds];
    const supabase = getServiceClient();

    // Verify all provided table IDs exist in this venue floor plan.
    const { data: tables } = await (supabase as any)
      .from('venue_tables')
      .select('id')
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .in('id', allTableIds);
    if ((tables || []).length !== allTableIds.length) {
      return NextResponse.json(
        { error: 'One or more table IDs are invalid for this venue' },
        { status: 400 },
      );
    }

    // Verify all tables are currently available
    const { data: statuses } = await (supabase as any)
      .from('table_status')
      .select('table_id, status')
      .eq('venue_id', venue_id)
      .eq('business_date', date)
      .in('table_id', allTableIds);

    const occupied = (statuses || []).filter(
      (s: any) => s.status !== 'available'
    );
    if (occupied.length > 0) {
      return NextResponse.json(
        { error: 'All tables must be available to combine' },
        { status: 409 },
      );
    }

    // Check for existing active combo on any of these tables
    const { data: existing } = await (supabase as any)
      .from('table_combos')
      .select('id, primary_table_id')
      .eq('venue_id', venue_id)
      .eq('business_date', date)
      .eq('status', 'active')
      .or(
        allTableIds
          .map((id) => `primary_table_id.eq.${id},combined_table_ids.cs.{${id}}`)
          .join(','),
      );

    if (existing?.length > 0) {
      return NextResponse.json(
        { error: 'One or more tables are already in an active combo' },
        { status: 409 },
      );
    }

    const { data: combo, error } = await (supabase as any)
      .from('table_combos')
      .insert({
        org_id: orgId,
        venue_id,
        business_date: date,
        primary_table_id,
        combined_table_ids: allTableIds,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ combo });
  });
}

// ── DELETE ───────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { combo_id } = body;

    if (!combo_id) {
      return NextResponse.json({ error: 'combo_id required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data: combo } = await (supabase as any)
      .from('table_combos')
      .select('id, venue_id')
      .eq('id', combo_id)
      .maybeSingle();

    if (!combo) {
      return NextResponse.json({ error: 'Combo not found' }, { status: 404 });
    }
    assertVenueAccess(combo.venue_id, venueIds);

    const { error } = await (supabase as any)
      .from('table_combos')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('id', combo_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  });
}
