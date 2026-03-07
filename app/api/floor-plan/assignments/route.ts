import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getStaffAssignments,
  upsertStaffAssignment,
  removeStaffAssignment,
  autoPopulateFromSchedule,
} from '@/lib/database/floor-plan';

/** GET - Staff assignments for a venue/date/shift, optionally with scheduled FOH staff */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);

    const sp = request.nextUrl.searchParams;
    const venueId = sp.get('venue_id');
    const date = sp.get('date');
    const shiftType = sp.get('shift_type');

    if (!venueId || !date || !shiftType) {
      return NextResponse.json(
        { error: 'venue_id, date, and shift_type are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venueId, venueIds);

    const [assignments, scheduledStaff] = await Promise.all([
      getStaffAssignments(venueId, date, shiftType),
      sp.get('include_scheduled') === 'true'
        ? autoPopulateFromSchedule(venueId, date, shiftType)
        : Promise.resolve([]),
    ]);

    // Compute unassigned: scheduled FOH staff not yet assigned to any section
    const assignedIds = new Set(assignments.map((a) => a.employee_id));
    const unassigned = scheduledStaff.filter((s) => !assignedIds.has(s.employee_id));

    return NextResponse.json({ assignments, unassigned });
  });
}

/** POST - Assign staff to a section (or bulk-assign) */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, section_id, employee_id, business_date, shift_type } = body;

    if (!venue_id || !section_id || !employee_id || !business_date || !shift_type) {
      return NextResponse.json(
        { error: 'venue_id, section_id, employee_id, business_date, and shift_type are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    const assignment = await upsertStaffAssignment(venue_id, orgId, {
      section_id,
      employee_id,
      business_date,
      shift_type,
      assigned_by: user.id,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  });
}

/** DELETE - Remove a staff assignment */
export async function DELETE(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    await removeStaffAssignment(id);
    return NextResponse.json({ ok: true });
  });
}
