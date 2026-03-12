import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  deleteShiftSplits,
  autoPopulateFromSchedule,
  autoSplitTables,
  getTablesForVenue,
  upsertShiftSplit,
  getShiftSplits,
} from '@/lib/database/floor-plan';

/**
 * POST - Force re-split: delete existing splits and regenerate
 * based on current scheduled server count.
 */
export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const { venue_id, business_date, shift_type } = body;

    if (!venue_id || !business_date || !shift_type) {
      return NextResponse.json(
        { error: 'venue_id, business_date, and shift_type are required' },
        { status: 400 },
      );
    }
    assertVenueAccess(venue_id, venueIds);

    // Clear existing splits
    await deleteShiftSplits(venue_id, business_date, shift_type);

    // Get scheduled servers
    const scheduledStaff = await autoPopulateFromSchedule(venue_id, business_date, shift_type);

    if (scheduledStaff.length === 0) {
      return NextResponse.json({ splits: [], unassigned: [] });
    }

    // Auto-split tables
    const tables = await getTablesForVenue(venue_id);
    const groups = autoSplitTables(tables, scheduledStaff.length);

    // Assign servers to groups round-robin
    for (let i = 0; i < groups.length; i++) {
      const server = scheduledStaff[i % scheduledStaff.length];
      await upsertShiftSplit(venue_id, orgId, {
        employee_id: server.employee_id,
        table_ids: groups[i].table_ids,
        section_label: groups[i].label,
        section_color: groups[i].color,
        business_date,
        shift_type,
      });
    }

    // Re-fetch with joined employee data
    const splits = await getShiftSplits(venue_id, business_date, shift_type);
    const assignedIds = new Set(splits.map((s) => s.employee_id));
    const unassigned = scheduledStaff.filter((s) => !assignedIds.has(s.employee_id));

    return NextResponse.json({ splits, unassigned });
  });
}
