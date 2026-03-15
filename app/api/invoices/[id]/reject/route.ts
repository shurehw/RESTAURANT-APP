import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { requireUser } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const body = await request.json();
    const { reason } = body;
    void reason;

    await requireUser();
    const supabase = createAdminClient();

    // Some environments do not have an invoices.notes column. Keep rejection
    // behavior schema-safe by only changing the status here.
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'draft',
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
