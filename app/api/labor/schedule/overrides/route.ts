/**
 * /api/labor/schedule/overrides
 * CRUD for schedule_position_overrides — admin-set shift times, CPLH, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get('venue_id');
  if (!venueId) {
    return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  // Return ALL overrides (active and inactive) so the UI can show saved values
  // and display the correct toggle state
  const { data, error } = await supabase
    .from('schedule_position_overrides')
    .select('*')
    .eq('venue_id', venueId)
    .order('position_name');

  if (error) {
    // Table may not exist yet
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return NextResponse.json({ data: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const overrides = body.overrides;

  if (!Array.isArray(overrides) || overrides.length === 0) {
    return NextResponse.json({ error: 'overrides[] required' }, { status: 400 });
  }

  // Get venue_id from the first override item
  const venueId = overrides[0]?.venue_id;
  if (!venueId) {
    return NextResponse.json({ error: 'venue_id required in override items' }, { status: 400 });
  }

  const supabase = await createClient();

  // Upsert each override (unique on venue_id + position_name)
  const results = [];
  for (const ov of overrides) {
    const { data, error } = await supabase
      .from('schedule_position_overrides')
      .upsert(
        {
          venue_id: ov.venue_id || venueId,
          position_name: ov.position_name,
          shift_start: ov.shift_start || null,
          shift_end: ov.shift_end || null,
          min_shift_hours: ov.min_shift_hours ?? 6.0,
          cplh_override: ov.cplh_override || null,
          min_staff: ov.min_staff ?? 0,
          max_staff: ov.max_staff || null,
          bar_guest_pct: ov.bar_guest_pct ?? 0,
          is_active: ov.is_active !== undefined ? ov.is_active : true,
          notes: ov.notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'venue_id,position_name' },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    results.push(data);
  }

  return NextResponse.json({ data: results });
}

export async function DELETE(req: NextRequest) {
  const venueId = req.nextUrl.searchParams.get('venue_id');
  const positionName = req.nextUrl.searchParams.get('position_name');

  if (!venueId || !positionName) {
    return NextResponse.json({ error: 'venue_id and position_name required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('schedule_position_overrides')
    .delete()
    .eq('venue_id', venueId)
    .eq('position_name', positionName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
