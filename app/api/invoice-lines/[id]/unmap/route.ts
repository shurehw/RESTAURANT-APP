import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';

/**
 * Unmap an invoice line from its item
 * Sets item_id to NULL so it can be remapped
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = createAdminClient();

    // Update the invoice line to remove item mapping
    const { error } = await supabase
      .from('invoice_lines')
      .update({ item_id: null })
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  });
}
