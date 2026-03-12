import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import {
  generateAutoPurchaseOrders,
  previewAutoPurchaseOrders,
  approvePurchaseOrder,
} from '@/lib/database/auto-po-generator';

/**
 * GET /api/inventory/auto-po
 * Preview what auto PO would generate (dry run).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const preview = await previewAutoPurchaseOrders(venueId);
    return NextResponse.json(preview);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/inventory/auto-po
 * Generate auto purchase orders or approve a PO.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const body = await req.json();

    if (body.action === 'approve') {
      const supabase = await createClient();
      const { data: po } = await supabase
        .from('purchase_orders')
        .select('venue_id')
        .eq('id', body.po_id)
        .single();
      if (!po?.venue_id) {
        return NextResponse.json({ error: 'PO not found' }, { status: 404 });
      }
      assertVenueAccess(po.venue_id, venueIds);
      await approvePurchaseOrder(body.po_id, user.id);
      return NextResponse.json({ success: true });
    }

    const venueId = body.venue_id || (venueIds.length === 1 ? venueIds[0] : null);
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    const result = await generateAutoPurchaseOrders(venueId, 'manual', user.id);
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
