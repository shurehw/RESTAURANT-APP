import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getLabelsForVenue,
  upsertLabel,
  bulkUpdateLabelPositions,
  deleteLabel,
} from '@/lib/database/floor-plan';

/** GET - All active labels for a venue */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const labels = await getLabelsForVenue(venueId);
    return NextResponse.json({ labels });
  });
}

/** POST - Create a new label */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, text, pos_x, pos_y, font_size, rotation, color } = body;

    if (!venue_id || !text) {
      return NextResponse.json({ error: 'venue_id and text are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const label = await upsertLabel(venue_id, orgId, {
      text,
      pos_x,
      pos_y,
      font_size,
      rotation,
      color,
    });

    return NextResponse.json({ label }, { status: 201 });
  });
}

/** PATCH - Update label(s). Supports bulk position updates. */
export async function PATCH(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();

    // Bulk position update: { venue_id, updates: [{id, pos_x, pos_y}] }
    if (body.updates && Array.isArray(body.updates)) {
      if (!body.venue_id) {
        return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
      }
      assertVenueAccess(body.venue_id, venueIds);
      await bulkUpdateLabelPositions(body.updates);
      return NextResponse.json({ ok: true });
    }

    // Single label update
    const { id, venue_id, text, pos_x, pos_y, font_size, rotation, color } = body;
    if (!id || !venue_id) {
      return NextResponse.json({ error: 'id and venue_id are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const label = await upsertLabel(venue_id, orgId, {
      id,
      text,
      pos_x,
      pos_y,
      font_size,
      rotation,
      color,
    });

    return NextResponse.json({ label });
  });
}

/** DELETE - Soft-delete a label */
export async function DELETE(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const labelId = request.nextUrl.searchParams.get('id');
    if (!labelId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await deleteLabel(labelId);
    return NextResponse.json({ ok: true });
  });
}
