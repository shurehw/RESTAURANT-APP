import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { requireUser } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();
    const user = await requireUser();

    // 1. Validate invoice exists and is in approvable state
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, status, vendor_id, venue_id')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (!['draft', 'pending_approval'].includes(invoice.status || '')) {
      return NextResponse.json(
        { 
          error: 'Invoice cannot be approved',
          details: `Invoice is in ${invoice.status} status. Only draft or pending_approval invoices can be approved.`
        },
        { status: 400 }
      );
    }

    // 2. Check if all items are mapped (optional validation - can be made strict)
    const { data: unmappedLines, error: linesError } = await supabase
      .from('invoice_lines')
      .select('id')
      .eq('invoice_id', id)
      .is('item_id', null)
      .limit(1);

    if (linesError) {
      console.error('Error checking unmapped lines:', linesError);
    }

    const hasUnmappedItems = unmappedLines && unmappedLines.length > 0;

    // 3. Update invoice status to approved
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error approving invoice:', updateError);
      return NextResponse.json(
        { error: 'Failed to approve invoice', details: updateError.message },
        { status: 500 }
      );
    }

    // 4. Create audit trail record
    const { error: auditError } = await supabase
      .from('ap_approvals')
      .insert({
        invoice_id: id,
        approver_user_id: user.id,
        status: 'approved',
        approved_at: new Date().toISOString(),
      });

    if (auditError) {
      // Log but don't fail - audit trail is important but shouldn't block approval
      console.error('Error creating approval audit record:', auditError);
    }

    return NextResponse.json({ 
      success: true,
      warning: hasUnmappedItems 
        ? 'Invoice approved with unmapped items' 
        : undefined
    });
  });
}
