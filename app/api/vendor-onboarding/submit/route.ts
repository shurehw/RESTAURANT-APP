import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const vendorId = formData.get('vendorId') as string;
    const supabase = await createClient();

    // Validate vendor exists
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('id', vendorId)
      .single();

    if (!vendor) {
      return NextResponse.json(
        { error: 'Invalid vendor ID' },
        { status: 400 }
      );
    }

    // Upload files to storage
    let voidedCheckUrl = null;
    let w9Url = null;

    const voidedCheckFile = formData.get('voidedCheck') as File;
    const w9File = formData.get('w9') as File;

    if (voidedCheckFile) {
      const fileName = `${vendorId}/voided-check-${Date.now()}.${voidedCheckFile.name.split('.').pop()}`;
      const { data: uploadData } = await supabase.storage
        .from('vendor-documents')
        .upload(fileName, voidedCheckFile);

      if (uploadData) {
        voidedCheckUrl = supabase.storage.from('vendor-documents').getPublicUrl(uploadData.path).data.publicUrl;
      }
    }

    if (w9File) {
      const fileName = `${vendorId}/w9-${Date.now()}.pdf`;
      const { data: uploadData } = await supabase.storage
        .from('vendor-documents')
        .upload(fileName, w9File);

      if (uploadData) {
        w9Url = supabase.storage.from('vendor-documents').getPublicUrl(uploadData.path).data.publicUrl;
      }
    }

    // Create/update vendor profile
    const profileData = {
      vendor_id: vendorId,
      entity_type: formData.get('entityType') as string,
      legal_name: formData.get('legalName') as string,
      company_name: formData.get('companyName') as string,
      address_line1: formData.get('addressLine1') as string,
      address_line2: formData.get('addressLine2') as string,
      city: formData.get('city') as string,
      state: formData.get('state') as string,
      zip_code: formData.get('zipCode') as string,
      contact_person_first_name: formData.get('contactFirstName') as string,
      contact_person_last_name: formData.get('contactLastName') as string,
      remittance_email: formData.get('remittanceEmail') as string,
      bank_name: formData.get('bankName') as string,
      bank_address_line1: formData.get('bankAddressLine1') as string,
      bank_address_line2: formData.get('bankAddressLine2') as string,
      bank_city: formData.get('bankCity') as string,
      bank_state: formData.get('bankState') as string,
      bank_zip_code: formData.get('bankZipCode') as string,
      name_on_account: formData.get('nameOnAccount') as string,
      bank_routing_number: formData.get('routingNumber') as string,
      account_type: formData.get('accountType') as string,
      account_number_last4: formData.get('accountNumberLast4') as string,
      voided_check_url: voidedCheckUrl,
      w9_form_url: w9Url,
      profile_complete: true,
      updated_at: new Date().toISOString(),
    };

    // Upsert profile
    const { error: profileError } = await supabase
      .from('vendor_profiles')
      .upsert(profileData, {
        onConflict: 'vendor_id',
      });

    if (profileError) throw profileError;

    // Create ACH form
    const achFormData = {
      vendor_id: vendorId,
      form_type: formData.get('formType') as string,
      authorized_by: formData.get('signatureName') as string,
      signature_data: formData.get('signatureName') as string, // In production, use proper signature capture
      signature_date: formData.get('signatureDate') as string,
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    const { error: achError } = await supabase
      .from('vendor_ach_forms')
      .insert(achFormData);

    if (achError) throw achError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Vendor onboarding submit error:', error);
    return NextResponse.json(
      { error: 'Failed to submit vendor profile' },
      { status: 500 }
    );
  }
}
