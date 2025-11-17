/**
 * Check invoice #35738 directly
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const serviceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

const supabase = createClient(supabaseUrl, serviceKey);

async function checkInvoice() {
  console.log('🔍 Checking invoice #35738...\n');

  // Get the invoice
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', '35738')
    .single();

  if (!invoice) {
    console.log('❌ Invoice not found!');
    return;
  }

  console.log('Invoice found:');
  console.log(JSON.stringify(invoice, null, 2));
  console.log('');

  // Check if vendor exists
  if (invoice.vendor_id) {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('id', invoice.vendor_id)
      .single();

    console.log('Vendor:', vendor ? vendor.name : 'NOT FOUND');
  } else {
    console.log('⚠️  No vendor_id on invoice');
  }

  // Check if venue exists
  if (invoice.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('id, name, organization_id')
      .eq('id', invoice.venue_id)
      .single();

    console.log('Venue:', venue ? `${venue.name} (${venue.id})` : 'NOT FOUND');
    if (venue) {
      console.log('Venue org_id:', venue.organization_id);
    }
  } else {
    console.log('⚠️  No venue_id on invoice');
  }

  console.log('\n---\n');

  // Try the query with !inner joins
  console.log('Testing query WITH !inner joins...');
  const { data: withInner, error: innerError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      vendor:vendors!inner(name),
      venue:venues!inner(name)
    `)
    .eq('invoice_number', '35738');

  console.log('Result:', withInner?.length || 0, 'invoices');
  if (innerError) {
    console.log('Error:', innerError.message);
  }
  if (withInner && withInner.length > 0) {
    console.log(JSON.stringify(withInner, null, 2));
  }

  console.log('\n---\n');

  // Try without !inner
  console.log('Testing query WITHOUT !inner joins...');
  const { data: withoutInner } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      vendor:vendors(name),
      venue:venues(name)
    `)
    .eq('invoice_number', '35738');

  console.log('Result:', withoutInner?.length || 0, 'invoices');
  if (withoutInner && withoutInner.length > 0) {
    console.log(JSON.stringify(withoutInner, null, 2));
  }
}

checkInvoice().catch(console.error);
