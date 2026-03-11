import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  getShiftSplits,
  upsertShiftSplit,
  reassignTable,
  autoPopulateFromSchedule,
  autoSplitTables,
  getTablesForVenue,
} from '@/lib/database/floor-plan';

/**
 * GET - Shift table splits for a venue/date/shift.
 * Auto-generates splits if none exist and servers are scheduled.
 */
export async function GET(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

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

    // Check for existing splits
    let splits = await getShiftSplits(venueId, date, shiftType);

    // If no splits exist, auto-generate from schedule
    if (splits.length === 0) {
      const scheduledStaff = await autoPopulateFromSchedule(venueId, date, shiftType);

      if (scheduledStaff.length > 0) {
        const tables = await getTablesForVenue(venueId);
        const groups = autoSplitTables(tables, scheduledStaff.length);

        // Assign servers to groups round-robin
        for (let i = 0; i < groups.length; i++) {
          const server = scheduledStaff[i % scheduledStaff.length];
          await upsertShiftSplit(venueId, orgId, {
            employee_id: server.employee_id,
            table_ids: groups[i].table_ids,
            section_label: groups[i].label,
            section_color: groups[i].color,
            business_date: date,
            shift_type: shiftType,
          });
        }

        // Re-fetch with joined employee data
        splits = await getShiftSplits(venueId, date, shiftType);
      }
    }

    // Compute unassigned: scheduled staff without a split
    const scheduledStaff = await autoPopulateFromSchedule(venueId, date, shiftType);
    const assignedIds = new Set(splits.map((s) => s.employee_id));
    const unassigned = scheduledStaff.filter((s) => !assignedIds.has(s.employee_id));

    return NextResponse.json({ splits, unassigned });
  });
}

/**
 * POST - Reassign a table between servers, or create/update a split.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    assertVenueAccess(body.venue_id, venueIds);

    // Table reassignment: move one table between servers
    if (body.reassign_table_id) {
      const { venue_id, business_date, shift_type, reassign_table_id, from_employee_id, to_employee_id } = body;
      if (!venue_id || !business_date || !shift_type || !reassign_table_id || !from_employee_id || !to_employee_id) {
        return NextResponse.json({ error: 'Missing required fields for reassignment' }, { status: 400 });
      }
      await reassignTable(venue_id, business_date, shift_type, reassign_table_id, from_employee_id, to_employee_id);
      return NextResponse.json({ ok: true });
    }

    // Upsert a full split
    const { venue_id, employee_id, table_ids, section_label, section_color, business_date, shift_type } = body;
    if (!venue_id || !employee_id || !table_ids || !business_date || !shift_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const split = await upsertShiftSplit(venue_id, orgId, {
      employee_id,
      table_ids,
      section_label: section_label || 'Section',
      section_color: section_color || '#6B7280',
      business_date,
      shift_type,
    });

    return NextResponse.json({ split }, { status: 201 });
  });
}

/** DELETE - Remove a shift split */
export async function DELETE(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const supabase = (await import('@/lib/supabase/service')).getServiceClient();
    const { error } = await (supabase as any)
      .from('shift_table_splits')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  });
}
