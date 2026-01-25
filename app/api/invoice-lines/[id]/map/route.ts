import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();
    const cookieStore = await cookies();

    const body = await request.json();
    const { item_id } = body;

    if (!item_id) {
      return NextResponse.json(
        { error: 'item_id is required' },
        { status: 400 }
      );
    }

    // Get user ID from cookie (custom auth) or Supabase session
    let userId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - No active session' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient();

    // Get the invoice line details to learn vendor SKU
    const { data: invoiceLine } = await adminClient
      .from('invoice_lines')
      .select('description, vendor_item_code, invoice_id, invoices(vendor_id)')
      .eq('id', id)
      .single();

    if (!invoiceLine) {
      return NextResponse.json(
        { error: 'Invoice line not found' },
        { status: 404 }
      );
    }

    // Update the invoice line with the mapped item
    const { error } = await adminClient
      .from('invoice_lines')
      .update({ item_id })
      .eq('id', id);

    if (error) {
      console.error('Error mapping invoice line:', error);
      return NextResponse.json(
        { error: 'Failed to map item', details: error.message },
        { status: 500 }
      );
    }

    // Create vendor alias for future auto-matching (if we have vendor SKU)
    const vendorId = (invoiceLine.invoices as any)?.vendor_id;

    if (vendorId && invoiceLine.vendor_item_code) {
      // Extract pack size from description (e.g., "6/Cs", "750ml")
      const packSizeMatch = invoiceLine.description.match(/(\d+\/\d+|\d+\s*(ml|l|gal|oz|lb|cs|case))/i);
      const packSize = packSizeMatch ? packSizeMatch[0] : null;

      // Upsert vendor alias for future matching
      await adminClient
        .from('vendor_item_aliases')
        .upsert({
          vendor_id: vendorId,
          item_id: item_id,
          vendor_item_code: invoiceLine.vendor_item_code,
          vendor_description: invoiceLine.description,
          pack_size: packSize,
          is_active: true,
        }, {
          onConflict: 'vendor_id,vendor_item_code',
        });

      console.log(`✓ Learned vendor alias: ${invoiceLine.vendor_item_code} → item ${item_id}`);
    }

    return NextResponse.json({ success: true });
  });
}
