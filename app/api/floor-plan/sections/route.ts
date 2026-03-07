import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getSectionsForVenue,
  upsertSection,
  deleteSection,
} from '@/lib/database/floor-plan';

/** GET - All active sections for a venue */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const venueId = request.nextUrl.searchParams.get('venue_id');
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const sections = await getSectionsForVenue(venueId);
    return NextResponse.json({ sections });
  });
}

/** POST - Create a new section */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, name, color, sr_seating_area, sort_order } = body;

    if (!venue_id || !name) {
      return NextResponse.json({ error: 'venue_id and name are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const section = await upsertSection(venue_id, orgId, {
      name,
      color,
      sr_seating_area,
      sort_order,
    });

    return NextResponse.json({ section }, { status: 201 });
  });
}

/** PATCH - Update an existing section */
export async function PATCH(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { id, venue_id, name, color, sr_seating_area, sort_order } = body;

    if (!id || !venue_id) {
      return NextResponse.json({ error: 'id and venue_id are required' }, { status: 400 });
    }
    assertVenueAccess(venue_id, venueIds);

    const section = await upsertSection(venue_id, orgId, {
      id,
      name,
      color,
      sr_seating_area,
      sort_order,
    });

    return NextResponse.json({ section });
  });
}

/** DELETE - Soft-delete a section */
export async function DELETE(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const sectionId = request.nextUrl.searchParams.get('id');
    if (!sectionId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await deleteSection(sectionId);
    return NextResponse.json({ ok: true });
  });
}
