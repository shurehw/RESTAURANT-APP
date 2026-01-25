/**
 * Fix invoices where vendor was OCR'd as "Delilah Dallas LLC"
 * (the restaurant name) instead of actual vendor like "Ben E Keith"
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixDelilahVendor() {
  console.log('🔍 Finding invoices with vendor = "Delilah Dallas LLC"...\n');

  // Find the "Delilah Dallas LLC" vendor
  const { data: delilahVendor } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Delilah Dallas%')
    .single();

  if (!delilahVendor) {
    console.log('No "Delilah Dallas" vendor found - this is actually good!');
    return;
  }

  console.log(`Found vendor: "${delilahVendor.name}" (ID: ${delilahVendor.id})\n`);

  // Find all invoices with this vendor
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, storage_path, ocr_raw_json')
    .eq('vendor_id', delilahVendor.id)
    .order('invoice_date');

  if (!invoices || invoices.length === 0) {
    console.log('No invoices found with this vendor');
    return;
  }

  console.log(`Found ${invoices.length} invoices with vendor = "Delilah Dallas LLC":\n`);

  for (const invoice of invoices) {
    console.log(`Invoice #${invoice.invoice_number}`);
    console.log(`  Date: ${invoice.invoice_date}`);
    console.log(`  Amount: $${invoice.total_amount}`);
    console.log(`  Storage: ${invoice.storage_path}`);

    // Try to extract actual vendor from OCR data
    if (invoice.ocr_raw_json) {
      const ocr = invoice.ocr_raw_json as any;
      console.log(`  OCR Vendor: ${ocr.vendor_name || 'N/A'}`);
    }
    console.log();
  }

  console.log('═'.repeat(80));
  console.log('\n⚠️  These invoices need manual review to determine correct vendor.');
  console.log('\nOptions:');
  console.log('1. Review the PDF/image for each invoice');
  console.log('2. Update vendor_id to correct vendor (likely Ben E Keith)');
  console.log('3. Delete the "Delilah Dallas LLC" vendor if no invoices should use it\n');

  // Find Ben E Keith vendor
  const { data: benEKeith } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Ben%Keith%')
    .single();

  if (benEKeith) {
    console.log(`Found Ben E Keith vendor: "${benEKeith.name}" (ID: ${benEKeith.id})`);
    console.log('\nTo reassign all invoices to Ben E Keith, run:');
    console.log(`  UPDATE invoices SET vendor_id = '${benEKeith.id}' WHERE vendor_id = '${delilahVendor.id}';`);
  }
}

fixDelilahVendor().catch(console.error);
