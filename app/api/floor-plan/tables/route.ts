import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getTablesForVenue,
  upsertTable,
  bulkUpdateTablePositions,
  deleteTable,
} from '@/lib/database/floor-plan';

/** GET - All active tables for a venue */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const tables = await getTablesForVenue(venueId);
    return NextResponse.json({ tables });
  });
}

/** POST - Create a new table */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, table_number, min_capacity, max_capacity, shape, section_id, pos_x, pos_y, width, height, rotation } = body;

    if (!venue_id || !table_number) {
      return NextResponse.json({ error: 'venue_id and table_number are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const table = await upsertTable(venue_id, orgId, {
      table_number,
      min_capacity,
      max_capacity,
      shape,
      section_id,
      pos_x,
      pos_y,
      width,
      height,
      rotation,
    });

    return NextResponse.json({ table }, { status: 201 });
  });
}

/** PATCH - Update table(s). Supports single update or bulk position updates. */
export async function PATCH(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();

    // Bulk position update: { venue_id, updates: [{id, pos_x, pos_y, ...}] }
    if (body.updates && Array.isArray(body.updates)) {
      if (!body.venue_id) {
        return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
      }
      assertVenueAccess(body.venue_id, venueIds);
      await bulkUpdateTablePositions(body.updates);
      return NextResponse.json({ ok: true });
    }

    // Single table update
    const { id, venue_id, table_number, min_capacity, max_capacity, shape, section_id, pos_x, pos_y, width, height, rotation } = body;
    if (!id || !venue_id) {
      return NextResponse.json({ error: 'id and venue_id are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const table = await upsertTable(venue_id, orgId, {
      id,
      table_number,
      min_capacity,
      max_capacity,
      shape,
      section_id,
      pos_x,
      pos_y,
      width,
      height,
      rotation,
    });

    return NextResponse.json({ table });
  });
}

/** DELETE - Soft-delete a table */
export async function DELETE(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const tableId = request.nextUrl.searchParams.get('id');
    if (!tableId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await deleteTable(tableId);
    return NextResponse.json({ ok: true });
  });
}
