import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  logWaste,
  getWasteSummary,
  getWasteByItem,
  getWasteReasonCodes,
} from '@/lib/database/waste-tracking';

/**
 * GET /api/inventory/waste
 * Query waste logs — summary by reason, by item, or reason codes.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'summary';
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);
    const startDate = searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || startDate;

    if (mode === 'reason_codes') {
      const codes = await getWasteReasonCodes(orgId);
      return NextResponse.json({ reason_codes: codes });
    }

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    if (mode === 'by_item') {
      const items = await getWasteByItem(venueId, startDate, endDate);
      return NextResponse.json({ items });
    }

    const summary = await getWasteSummary(venueId, startDate, endDate);
    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/inventory/waste
 * Log a waste event. Trigger auto-depletes inventory.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const body = await req.json();
    const venueId = body.venue_id || (venueIds.length === 1 ? venueIds[0] : null);
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const result = await logWaste({
      venue_id: venueId,
      item_id: body.item_id,
      reason_code_id: body.reason_code_id,
      quantity: body.quantity,
      uom: body.uom,
      unit_cost: body.unit_cost,
      notes: body.notes,
      recorded_by: user.id,
      business_date: body.business_date || new Date().toISOString().split('T')[0],
      shift_period: body.shift_period,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
