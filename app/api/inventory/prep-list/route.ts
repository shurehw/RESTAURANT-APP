import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  generatePrepList,
  getPrepList,
  getPrepListByStation,
  completePrepItem,
  skipPrepItem,
  publishPrepList,
  getPrepCompletionStats,
} from '@/lib/database/prep-lists';

/**
 * GET /api/inventory/prep-list
 * Get prep list for a venue and date.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);
    const businessDate = searchParams.get('business_date') || new Date().toISOString().split('T')[0];
    const mode = searchParams.get('mode') || 'list';

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    if (mode === 'by_station') {
      const byStation = await getPrepListByStation(venueId, businessDate);
      return NextResponse.json({ stations: byStation });
    }

    if (mode === 'stats') {
      const stats = await getPrepCompletionStats(venueId, businessDate);
      return NextResponse.json({ stats });
    }

    const result = await getPrepList(venueId, businessDate);
    if (!result) {
      return NextResponse.json({ error: 'No prep list found for this date' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/inventory/prep-list
 * Generate, publish, or update prep list items.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const body = await req.json();
    const scoped = await createClient();

    if (body.action === 'generate') {
      const venueId = body.venue_id || (venueIds.length === 1 ? venueIds[0] : null);
      if (!venueId) {
        return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
      }
      assertVenueAccess(venueId, venueIds);
      const list = await generatePrepList(venueId, body.business_date);
      return NextResponse.json(list, { status: 201 });
    }

    if (body.action === 'publish') {
      const { data: list } = await scoped
        .from('prep_lists')
        .select('venue_id')
        .eq('id', body.prep_list_id)
        .single();
      if (!list?.venue_id) {
        return NextResponse.json({ error: 'prep list not found' }, { status: 404 });
      }
      assertVenueAccess(list.venue_id, venueIds);
      await publishPrepList(body.prep_list_id);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'complete_item') {
      const { data: item } = await scoped
        .from('prep_list_items')
        .select('prep_list_id')
        .eq('id', body.item_id)
        .single();
      if (!item?.prep_list_id) {
        return NextResponse.json({ error: 'prep item not found' }, { status: 404 });
      }
      const { data: list } = await scoped
        .from('prep_lists')
        .select('venue_id')
        .eq('id', item.prep_list_id)
        .single();
      if (!list?.venue_id) {
        return NextResponse.json({ error: 'prep list not found' }, { status: 404 });
      }
      assertVenueAccess(list.venue_id, venueIds);
      await completePrepItem(body.item_id, user.id, body.actual_portions, body.notes);
      return NextResponse.json({ success: true });
    }

    if (body.action === 'skip_item') {
      const { data: item } = await scoped
        .from('prep_list_items')
        .select('prep_list_id')
        .eq('id', body.item_id)
        .single();
      if (!item?.prep_list_id) {
        return NextResponse.json({ error: 'prep item not found' }, { status: 404 });
      }
      const { data: list } = await scoped
        .from('prep_lists')
        .select('venue_id')
        .eq('id', item.prep_list_id)
        .single();
      if (!list?.venue_id) {
        return NextResponse.json({ error: 'prep list not found' }, { status: 404 });
      }
      assertVenueAccess(list.venue_id, venueIds);
      await skipPrepItem(body.item_id, user.id, body.reason);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
