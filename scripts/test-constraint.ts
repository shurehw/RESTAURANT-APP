import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testConstraint() {
  // Try to insert a duplicate to test constraint
  const testVendorId = '644b5899-1d55-449e-b7a6-f148f6e57f4a'; // Allen Brothers

  // Get a venue ID and its organization
  const { data: venues } = await supabase
    .from('venues')
    .select('id, organization_id')
    .limit(1);

  if (!venues || venues.length === 0) {
    console.log('No venues found');
    return;
  }

  const testVenueId = venues[0].id;
  const testOrgId = venues[0].organization_id;

  console.log('Testing constraint by attempting to insert duplicate invoice 1B8357...\n');

  const { data: insertData, error: insertError } = await supabase
    .from('invoices')
    .insert({
      venue_id: testVenueId,
      vendor_id: testVendorId,
      invoice_number: '1B8357',
      invoice_date: '2026-01-23',
      total_amount: 999.99,
      status: 'draft',
      organization_id: testOrgId
    })
    .select();

  if (insertError) {
    if (insertError.message.includes('invoices_vendor_invoice_unique') || insertError.code === '23505') {
      console.log('✅ CONSTRAINT EXISTS AND WORKS!');
      console.log('Duplicate was blocked by constraint.');
      console.log('Error:', insertError.message);
    } else {
      console.log('❌ Unexpected error:', insertError);
    }
  } else {
    console.log('⚠️  WARNING: CONSTRAINT DOES NOT EXIST!');
    console.log('Duplicate invoice was ALLOWED into database!');
    console.log('Inserted ID:', insertData[0].id);

    // Clean up the test insert
    await supabase.from('invoices').delete().eq('id', insertData[0].id);
    console.log('\n✅ Cleaned up test insert');
  }
}

testConstraint().catch(console.error);
