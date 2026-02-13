/**
 * Comp Exceptions API
 * Detects comps that violate h.wood Group SOP policies
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchCompExceptions } from '@/lib/database/tipsee';
import { getServiceClient } from '@/lib/supabase/service';
import { getCompSettingsForVenue } from '@/lib/database/comp-settings';
import { resolveContext } from '@/lib/auth/resolveContext';

export async function GET(request: NextRequest) {
  try {
    const ctx = await resolveContext();
    if (!ctx || !ctx.isAuthenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const venueId = searchParams.get('venue_id');

    if (!date || !venueId) {
      return NextResponse.json(
        { error: 'date and venue_id are required' },
        { status: 400 }
      );
    }

    // Get TipSee location UUID from venue mapping and org comp settings in parallel
    const supabase = getServiceClient();
    const [mappingResult, compSettings] = await Promise.all([
      (supabase as any)
        .from('venue_tipsee_mapping')
        .select('tipsee_location_uuid')
        .eq('venue_id', venueId)
        .single(),
      getCompSettingsForVenue(venueId),
    ]);

    if (mappingResult.error || !mappingResult.data?.tipsee_location_uuid) {
      return NextResponse.json(
        { error: 'No TipSee mapping found for this venue' },
        { status: 404 }
      );
    }

    const result = await fetchCompExceptions(
      date,
      mappingResult.data.tipsee_location_uuid,
      compSettings ? {
        approved_reasons: compSettings.approved_reasons,
        high_value_comp_threshold: compSettings.high_value_comp_threshold,
        high_comp_pct_threshold: compSettings.high_comp_pct_threshold,
        daily_comp_pct_warning: compSettings.daily_comp_pct_warning,
        daily_comp_pct_critical: compSettings.daily_comp_pct_critical,
      } : undefined
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Comp exceptions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
