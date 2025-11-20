import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return guard(async () => {
    const user = await requireUser();
    const { id: vendorId } = await params;
    const supabase = await createClient();

    const data = await request.json();

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('vendor_id', vendorId)
      .single();

    const profileData = {
      vendor_id: vendorId,
      entity_type: data.entityType,
      legal_name: data.legalName,
      company_name: data.companyName,
      address_line1: data.addressLine1,
      address_line2: data.addressLine2,
      city: data.city,
      state: data.state,
      zip_code: data.zipCode,
      contact_person_first_name: data.contactFirstName,
      contact_person_last_name: data.contactLastName,
      remittance_email: data.remittanceEmail,
      bank_name: data.bankName,
      bank_address_line1: data.bankAddressLine1,
      bank_address_line2: data.bankAddressLine2,
      bank_city: data.bankCity,
      bank_state: data.bankState,
      bank_zip_code: data.bankZipCode,
      name_on_account: data.nameOnAccount,
      bank_routing_number: data.routingNumber,
      account_type: data.accountType,
      account_number_last4: data.accountNumberLast4,
      profile_complete: !!(
        data.companyName &&
        data.addressLine1 &&
        data.city &&
        data.state &&
        data.zipCode &&
        data.contactFirstName &&
        data.contactLastName &&
        data.remittanceEmail &&
        data.bankName &&
        data.nameOnAccount &&
        data.routingNumber &&
        data.accountType &&
        data.accountNumberLast4
      ),
      updated_at: new Date().toISOString(),
    };

    if (existingProfile) {
      // Update existing profile
      const { error } = await supabase
        .from('vendor_profiles')
        .update(profileData)
        .eq('id', existingProfile.id);

      if (error) throw error;
    } else {
      // Create new profile
      const { error } = await supabase
        .from('vendor_profiles')
        .insert({
          ...profileData,
          created_at: new Date().toISOString(),
        });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  });
}
