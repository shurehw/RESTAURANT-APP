import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();

    console.log('Fetching PDF for invoice:', id);

    // Fetch invoice to get storage path
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('storage_path')
      .eq('id', id)
      .single();

    console.log('Invoice data:', invoice);
    console.log('Invoice error:', invoiceError);

    if (invoiceError) {
      console.error('Error fetching invoice:', invoiceError);
      return NextResponse.json(
        { error: 'Failed to fetch invoice', details: invoiceError.message },
        { status: 500 }
      );
    }

    if (!invoice?.storage_path) {
      console.log('No storage path found for invoice');
      return NextResponse.json(
        { error: 'Invoice PDF not found' },
        { status: 404 }
      );
    }

    console.log('Storage path:', invoice.storage_path);

    // Get signed URL for the PDF
    const { data: urlData, error: urlError } = await supabase
      .storage
      .from('invoices')
      .createSignedUrl(invoice.storage_path, 3600); // 1 hour expiry

    if (urlError) {
      console.error('Error creating signed URL:', urlError);
      return NextResponse.json(
        { error: 'Failed to access PDF', details: urlError.message },
        { status: 500 }
      );
    }

    if (!urlData?.signedUrl) {
      console.error('No signed URL returned');
      return NextResponse.json(
        { error: 'Failed to generate PDF URL' },
        { status: 500 }
      );
    }

    console.log('Signed URL created successfully');

    // Return the signed URL as JSON
    return NextResponse.json({ url: urlData.signedUrl });
  });
}
