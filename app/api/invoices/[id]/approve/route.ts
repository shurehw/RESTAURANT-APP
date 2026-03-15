import { createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { requireUser } from '@/lib/auth';
import { syncApprovedInvoiceCostsToRecipes } from '@/lib/invoices/cost-sync';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const user = await requireUser();
    const supabase = createAdminClient();

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

    // 2. Check for unresolved intake policy block violations
    const { hasUnresolvedBlocks } = await import('@/lib/enforcement/intake-policy');
    const blockCheck = await hasUnresolvedBlocks(id);
    const missingPolicySchema =
      blockCheck.blocked &&
      blockCheck.count === 1 &&
      blockCheck.violations[0]?.id === '' &&
      blockCheck.violations[0]?.message?.includes('Unable to verify intake policy status');

    if (blockCheck.blocked && !missingPolicySchema) {
      return NextResponse.json(
        {
          error: 'Invoice has unresolved intake policy violations',
          details: `${blockCheck.count} block-severity violation(s) must be resolved or overridden before approval.`,
          violations: blockCheck.violations,
        },
        { status: 400 }
      );
    }

    // 3. Check if all items are mapped (optional validation - can be made strict)
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

    // 4. Update invoice status to approved
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

    try {
      await syncApprovedInvoiceCostsToRecipes(id, { createdBy: user.id });
    } catch (costSyncError) {
      console.error('Error syncing invoice costs to recipes:', costSyncError);
    }

    return NextResponse.json({ 
      success: true,
      warning: hasUnmappedItems 
        ? 'Invoice approved with unmapped items' 
        : undefined
    });
  });
}
