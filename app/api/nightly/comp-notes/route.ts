/**
 * Comp Notes API
 * Manager notes for individual comps
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
    const businessDate = searchParams.get('business_date');

    if (!venueId || !businessDate) {
      return NextResponse.json(
        { error: 'venue_id and business_date are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { data, error } = await (supabase as any)
      .from('comp_notes')
      .select('check_id, notes, updated_at')
      .eq('venue_id', venueId)
      .eq('business_date', businessDate);

    if (error) {
      console.error('Error fetching comp notes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Return as a map of check_id -> notes for easy lookup
    const notesMap: Record<string, string> = {};
    for (const row of data || []) {
      notesMap[row.check_id] = row.notes;
    }

    return NextResponse.json({ notes: notesMap });
  } catch (error: any) {
    console.error('Comp notes API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { venue_id, business_date, check_id, notes } = body;

    if (!venue_id || !business_date || !check_id) {
      return NextResponse.json(
        { error: 'venue_id, business_date, and check_id are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Get venue's organization_id
    const { data: venue } = await (supabase as any)
      .from('venues')
      .select('organization_id')
      .eq('id', venue_id)
      .single();

    const organizationId = venue?.organization_id;

    // Upsert the note
    const { data, error } = await (supabase as any)
      .from('comp_notes')
      .upsert({
        organization_id: organizationId,
        venue_id,
        business_date,
        check_id,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'venue_id,business_date,check_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving comp note:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Comp notes API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
