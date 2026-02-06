/**
 * Comp Exceptions API
 * Detects comps that violate h.wood Group SOP policies
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchCompExceptions } from '@/lib/database/tipsee';
import { getServiceClient } from '@/lib/supabase/service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const venueId = searchParams.get('venue_id');

    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'date and venue_id are required' },
        { status: 400 }
      );
    }

    // Get TipSee location UUID from venue mapping
    const supabase = getServiceClient();
    const { data: mapping, error: mappingError } = await (supabase as any)
      .from('venue_tipsee_mapping')
      .select('tipsee_location_uuid')
      .eq('venue_id', venueId)
      .single();

    if (mappingError || !mapping?.tipsee_location_uuid) {
      return NextResponse.json(
        { error: 'No TipSee mapping found for this venue' },
        { status: 404 }
      );
    }

    const result = await fetchCompExceptions(date, mapping.tipsee_location_uuid);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Comp exceptions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
