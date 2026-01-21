import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertVenueAccess } from '@/lib/tenant';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  return guard(async () => {
    const user = await requireUser();
    const { orgId, venueIds } = await getUserOrgAndVenues(user.id);
    const { id } = await params;

    const supabase = await createClient();

    // Get invoice to verify access
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('venue_id, status, storage_path')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Invoice not found' };
    }

    assertVenueAccess(invoice.venue_id, venueIds);

    // Only allow deletion of draft/pending invoices
    if (invoice.status === 'approved') {
      throw {
        status: 400,
        code: 'CANNOT_DELETE_APPROVED',
        message: 'Cannot delete approved invoices. Please reject or void the invoice instead.',
      };
    }

    // Delete invoice (invoice_lines will cascade delete)
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete invoice:', deleteError);
      throw {
        status: 500,
        code: 'DELETE_FAILED',
        message: 'Failed to delete invoice',
      };
    }

    // Optional: Delete storage file if exists
    if (invoice.storage_path) {
      try {
        await supabase.storage
          .from('opsos-invoices')
          .remove([invoice.storage_path]);
      } catch (storageError) {
        console.warn('Failed to delete invoice file from storage:', storageError);
        // Don't fail the request if storage deletion fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  });
}
