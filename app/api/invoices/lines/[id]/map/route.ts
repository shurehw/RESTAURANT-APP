import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';
import { validate, uuid } from '@/lib/validate';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const mapSchema = z.object({
  item_id: uuid,
});

export async function POST(request: NextRequest, context: RouteContext) {
  return guard(async () => {
    rateLimit(request, ':invoice-map');
    const user = await requireUser();
    await getUserOrgAndVenues(user.id);

    const body = await request.json();
    const validated = validate(mapSchema, body);
    const { id: lineId } = await context.params;

    if (!/^[0-9a-f-]{36}$/i.test(lineId)) {
      throw { status: 400, code: 'INVALID_UUID' };
    }

    const supabase = await createClient();

    // Get the invoice line details including cost info for history tracking
    const { data: invoiceLine } = await supabase
      .from('invoice_lines')
      .select('description, invoice_id, vendor_item_code, unit_cost, invoices(vendor_id, venue_id, invoice_date)')
      .eq('id', lineId)
      .single();

    if (!invoiceLine) {
      throw { status: 404, code: 'LINE_NOT_FOUND' };
    }

    // Extract pack size from description (e.g., "6/Cs", "4/1 GAL", "750mL")
    const packSizeMatch = invoiceLine.description.match(/(\d+\/\d+|\d+\s*(ml|l|gal|oz|lb|cs|case))/i);
    const packSize = packSizeMatch ? packSizeMatch[0] : null;

    const invoice = invoiceLine.invoices as any;
    const vendorId = invoice?.vendor_id;
    const venueId = invoice?.venue_id;
    const invoiceDate = invoice?.invoice_date;

    // Update the invoice line with the mapped item
    const { error: updateError } = await supabase
      .from('invoice_lines')
      .update({ item_id: validated.item_id })
      .eq('id', lineId);

    if (updateError) throw updateError;

    // Create or update vendor_item_alias for future matching
    if (vendorId && invoiceLine.vendor_item_code) {
      await supabase
        .from('vendor_item_aliases')
        .upsert({
          vendor_id: vendorId,
          item_id: validated.item_id,
          vendor_item_code: invoiceLine.vendor_item_code,
          vendor_description: invoiceLine.description,
          pack_size: packSize,
          is_active: true,
        }, {
          onConflict: 'vendor_id,vendor_item_code',
        });
    }

    // Record cost history for the newly mapped item
    if (invoiceLine.unit_cost != null) {
      await supabase.from('item_cost_history').insert({
        item_id: validated.item_id,
        vendor_id: vendorId || null,
        venue_id: venueId || null,
        cost: invoiceLine.unit_cost,
        effective_date: invoiceDate || new Date().toISOString(),
        source: 'invoice',
        source_id: lineId,
      });
    }

    return NextResponse.json({ success: true });
  });
}
