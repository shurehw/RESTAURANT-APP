import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  return guard(async () => {
    const user = await requireUser();
    const supabase = await createClient();

    const { vendorId, emailTo } = await request.json();

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      );
    }

    // Generate token
    const { data: tokenData } = await supabase
      .rpc('generate_onboarding_token');

    const token = tokenData;

    // Create invitation
    const { data: invitation, error } = await supabase
      .from('vendor_onboarding_invitations')
      .insert({
        vendor_id: vendorId,
        token,
        created_by: user.id,
        email_sent_to: emailTo,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;

    // Generate shareable link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const link = `${baseUrl}/vendor-onboarding/${token}`;

    return NextResponse.json({
      success: true,
      invitation,
      link,
    });
  });
}
