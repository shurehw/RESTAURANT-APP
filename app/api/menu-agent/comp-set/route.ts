/**
 * Comp Set Management
 *
 * GET  /api/menu-agent/comp-set — List comp set venues + price position map
 * POST /api/menu-agent/comp-set — Add/update comp set venue or items
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveContext } from '@/lib/auth/resolveContext';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getCompSetVenues,
  upsertCompSetVenue,
  upsertCompSetItems,
  getCompSetPriceMap,
  getCompSetPriceChanges,
} from '@/lib/database/comp-set';
import { buildCategoryPricePosition } from '@/lib/ai/comp-set-researcher';

export async function GET(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);
  const venueId = request.nextUrl.searchParams.get('venue_id');
  if (!venueId) {
    return NextResponse.json({ error: 'Missing venue_id' }, { status: 400 });
  }
  assertVenueAccess(venueId, venueIds);

  const includePositions = request.nextUrl.searchParams.get('positions') !== 'false';
  const includeChanges = request.nextUrl.searchParams.get('changes') === 'true';

  const venues = await getCompSetVenues(venueId);

  let pricePositions: any[] = [];
  let categoryPositions: any[] = [];
  let priceChanges: any[] = [];

  if (includePositions && venues.length > 0) {
    [pricePositions, categoryPositions] = await Promise.all([
      getCompSetPriceMap(venueId),
      buildCategoryPricePosition(venueId),
    ]);
  }

  if (includeChanges) {
    priceChanges = await getCompSetPriceChanges(venueId, 30);
  }

  return NextResponse.json({
    venues,
    price_positions: pricePositions,
    category_positions: categoryPositions,
    recent_price_changes: priceChanges,
  });
}

export async function POST(request: NextRequest) {
  const ctx = await resolveContext();
  if (!ctx?.orgId || !ctx.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { venueIds } = await getUserOrgAndVenues(ctx.authUserId);
  const venueId = request.nextUrl.searchParams.get('venue_id');
  if (!venueId) {
    return NextResponse.json({ error: 'Missing venue_id' }, { status: 400 });
  }
  assertVenueAccess(venueId, venueIds);

  const body = await request.json();

  // Add/update a comp set venue
  if (body.comp_venue_name) {
    const result = await upsertCompSetVenue({
      venue_id: venueId,
      org_id: ctx.orgId,
      comp_venue_name: body.comp_venue_name,
      comp_venue_address: body.comp_venue_address,
      source_url: body.source_url,
      platform: body.platform,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // If items are included, upsert them too
    if (body.items && Array.isArray(body.items) && result.id) {
      const itemResult = await upsertCompSetItems(result.id, body.items);
      return NextResponse.json({
        success: true,
        comp_venue_id: result.id,
        items_upserted: itemResult.count,
        price_changes_detected: itemResult.price_changes,
      });
    }

    return NextResponse.json({ success: true, comp_venue_id: result.id });
  }

  // Bulk add items to existing comp venue
  if (body.comp_venue_id && body.items) {
    const result = await upsertCompSetItems(body.comp_venue_id, body.items);
    return NextResponse.json({
      success: result.success,
      items_upserted: result.count,
      price_changes_detected: result.price_changes,
    });
  }

  return NextResponse.json(
    { error: 'Must provide comp_venue_name or (comp_venue_id + items)' },
    { status: 400 }
  );
}
