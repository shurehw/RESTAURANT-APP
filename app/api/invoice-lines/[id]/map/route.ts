import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();

    const body = await request.json();
    const { item_id } = body;

    if (!item_id) {
      return NextResponse.json(
        { error: 'item_id is required' },
        { status: 400 }
      );
    }

    // Update the invoice line with the mapped item
    const { error } = await supabase
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

    return NextResponse.json({ success: true });
  });
}
