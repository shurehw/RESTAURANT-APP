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

    // Update invoice status to approved
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error approving invoice:', error);
      return NextResponse.json(
        { error: 'Failed to approve invoice', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  });
}
