import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const { id } = await params;
    const supabase = await createClient();
    const cookieStore = await cookies();

    console.log('Fetching PDF for invoice:', id);

    // Get user ID from cookie (custom auth) or Supabase session
    let userId: string | null = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
    } else {
      const userIdCookie = cookieStore.get('user_id');
      userId = userIdCookie?.value || null;
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - No active session' },
        { status: 401 }
      );
    }

    // Use admin client to bypass RLS
    const adminClient = createAdminClient();

    // Verify user has access to this invoice's organization
    const { data: orgUsers } = await adminClient
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!orgUsers || orgUsers.length === 0) {
      return NextResponse.json(
        { error: 'User not associated with an organization' },
        { status: 403 }
      );
    }

    const userOrgIds = orgUsers.map(ou => ou.organization_id);

    // Fetch invoice to get storage path
    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .select('storage_path, organization_id')
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

    // Verify user has access to this invoice's organization
    if (!invoice?.organization_id || !userOrgIds.includes(invoice.organization_id)) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
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

    // Get signed URL for the PDF using admin client
    const { data: urlData, error: urlError } = await adminClient
      .storage
      .from('opsos-invoices')
      .createSignedUrl(invoice.storage_path, 3600); // 1 hour expiry

    if (urlError) {
      console.error('Error creating signed URL:', urlError);
      console.error('Storage path attempted:', invoice.storage_path);
      console.error('Bucket:', 'opsos-invoices');

      // Return more detailed error
      return NextResponse.json(
        {
          error: 'Failed to access PDF',
          details: urlError.message,
          storagePath: invoice.storage_path,
          bucket: 'opsos-invoices'
        },
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
