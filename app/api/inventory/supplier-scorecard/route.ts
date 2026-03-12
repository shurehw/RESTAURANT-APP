import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';
import { getServiceClient } from '@/lib/supabase/service';

/**
 * GET /api/inventory/supplier-scorecard
 * Query supplier scorecards, delivery receipts, or price stability.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('mode') || 'scorecard';
    const venueId = searchParams.get('venue_id') || (venueIds.length === 1 ? venueIds[0] : null);
    const vendorId = searchParams.get('vendor_id');
    const supabase = getServiceClient();

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    if (mode === 'price_stability') {
      let query = (supabase as any)
        .from('v_vendor_price_stability')
        .select('*')
        .eq('venue_id', venueId)
        .order('price_volatility_pct', { ascending: false });

      if (vendorId) query = query.eq('vendor_id', vendorId);
      const { data } = await query;
      return NextResponse.json({ items: data || [] });
    }

    if (mode === 'deliveries') {
      let query = (supabase as any)
        .from('delivery_receipts')
        .select('*, vendors(name)')
        .eq('venue_id', venueId)
        .order('delivery_date', { ascending: false })
        .limit(50);

      if (vendorId) query = query.eq('vendor_id', vendorId);
      const { data } = await query;
      return NextResponse.json({ deliveries: data || [] });
    }

    // Default: scorecards
    let query = (supabase as any)
      .from('v_supplier_scorecard')
      .select('*')
      .eq('venue_id', venueId)
      .order('composite_score', { ascending: true });

    if (vendorId) query = query.eq('vendor_id', vendorId);
    const { data } = await query;
    return NextResponse.json({ scorecards: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/inventory/supplier-scorecard
 * Record a delivery receipt with line items.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { venueIds } = await getUserOrgAndVenues(user.id);
    const body = await req.json();
    const supabase = getServiceClient();
    const venueId = body.venue_id || (venueIds.length === 1 ? venueIds[0] : null);
    if (!venueId) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
    assertVenueAccess(venueId, venueIds);

    // Create delivery receipt
    const { data: receipt, error: rErr } = await (supabase as any)
      .from('delivery_receipts')
      .insert({
        venue_id: venueId,
        vendor_id: body.vendor_id,
        purchase_order_id: body.purchase_order_id,
        delivery_date: body.delivery_date || new Date().toISOString().split('T')[0],
        received_by: user.id,
        expected_delivery_date: body.expected_delivery_date,
        overall_rating: body.overall_rating,
        notes: body.notes,
        po_total: body.po_total,
      })
      .select('id')
      .single();

    if (rErr) throw new Error(rErr.message);

    // Insert line items
    if (body.lines?.length) {
      const lines = body.lines.map((l: any) => ({
        delivery_receipt_id: receipt.id,
        item_id: l.item_id,
        po_item_id: l.po_item_id,
        ordered_qty: l.ordered_qty,
        received_qty: l.received_qty,
        unit_price_expected: l.unit_price_expected,
        unit_price_actual: l.unit_price_actual,
        line_status: l.line_status || 'correct',
        issue_reason: l.issue_reason,
        quality_rating: l.quality_rating,
        temperature_ok: l.temperature_ok,
      }));

      const { error: lErr } = await (supabase as any)
        .from('delivery_receipt_lines')
        .insert(lines);

      if (lErr) throw new Error(lErr.message);
    }

    return NextResponse.json({ receipt_id: receipt.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
