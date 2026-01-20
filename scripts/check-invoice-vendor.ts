import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  // Get the invoice with number 1841471
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_id, ocr_raw_json')
    .eq('invoice_number', '1841471')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Invoice:', invoice.invoice_number);
  console.log('Vendor ID:', invoice.vendor_id || 'NULL (not matched)');

  if (invoice.ocr_raw_json) {
    const ocr = invoice.ocr_raw_json as any;
    console.log('\nOCR extracted vendor name:', ocr.vendor || 'Not found in OCR data');
  }

  // Check if this vendor exists in vendors table
  if (invoice.ocr_raw_json) {
    const ocr = invoice.ocr_raw_json as any;
    const vendorName = ocr.vendor;

    if (vendorName) {
      const normalized = vendorName.toLowerCase().replace(/[,\.]/g, '').replace(/\s+/g, ' ').trim();
      console.log('Normalized vendor name:', normalized);

      const { data: vendors } = await supabase
        .from('vendors')
        .select('id, name, normalized_name')
        .eq('is_active', true);

      console.log('\nAll active vendors:');
      vendors?.forEach(v => console.log(`  - ${v.name} (normalized: ${v.normalized_name})`));

      const match = vendors?.find(v => v.normalized_name === normalized);
      if (match) {
        console.log('\n✓ Match found:', match.name);
      } else {
        console.log('\n❌ No match found. You need to add this vendor to the system.');
      }
    }
  }
}

main();
