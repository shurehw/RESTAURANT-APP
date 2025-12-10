import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    const supabase = await createClient();

    // Update invoice status to draft with rejection note
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'draft',
        notes: reason ? `Rejected: ${reason}` : 'Rejected by admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error rejecting invoice:', error);
      return NextResponse.json(
        { error: 'Failed to reject invoice', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  });
}
