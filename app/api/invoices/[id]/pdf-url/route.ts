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

    // Fetch invoice to get storage path
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('storage_path')
      .eq('id', id)
      .single();

    if (invoiceError || !invoice?.storage_path) {
      return NextResponse.json(
        { error: 'Invoice PDF not found' },
        { status: 404 }
      );
    }

    // Get signed URL for the PDF
    const { data: urlData, error: urlError } = await supabase
      .storage
      .from('invoices')
      .createSignedUrl(invoice.storage_path, 3600); // 1 hour expiry

    if (urlError || !urlData?.signedUrl) {
      console.error('Error creating signed URL:', urlError);
      return NextResponse.json(
        { error: 'Failed to access PDF' },
        { status: 500 }
      );
    }

    // Return the signed URL as JSON
    return NextResponse.json({ url: urlData.signedUrl });
  });
}
