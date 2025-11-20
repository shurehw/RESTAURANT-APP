import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, organizationId } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Look up vendor by email within the organization
    const { data: vendors, error } = await supabase
      .from('vendors')
      .select(`
        id,
        name,
        email,
        vendor_profiles (
          remittance_email
        )
      `)
      .eq('organization_id', organizationId)
      .or(`email.eq.${email},vendor_profiles.remittance_email.eq.${email}`)
      .limit(1);

    if (error) throw error;

    if (!vendors || vendors.length === 0) {
      return NextResponse.json(
        { error: 'No vendor found with this email address' },
        { status: 404 }
      );
    }

    const vendor = vendors[0];

    return NextResponse.json({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
      }
    });
  } catch (error) {
    console.error('Vendor lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to lookup vendor' },
      { status: 500 }
    );
  }
}
