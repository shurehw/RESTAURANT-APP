/**
 * Identify and fix invoices assigned to UNKNOWN or restaurant-name vendors
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixUnknownVendors() {
  console.log('🔍 Finding UNKNOWN and restaurant-name vendor invoices...\n');

  // Find UNKNOWN vendor
  const { data: unknownVendor } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('name', 'UNKNOWN')
    .single();

  if (unknownVendor) {
    const { data: unknownInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, storage_path, ocr_raw_json')
      .eq('vendor_id', unknownVendor.id)
      .order('invoice_date');

    if (unknownInvoices && unknownInvoices.length > 0) {
      console.log(`📋 UNKNOWN Vendor - ${unknownInvoices.length} invoices:\n`);

      for (const inv of unknownInvoices) {
        console.log(`Invoice #${inv.invoice_number} - ${inv.invoice_date} - $${inv.total_amount}`);
        console.log(`  Storage: ${inv.storage_path}`);

        // Try to extract vendor from OCR
        if (inv.ocr_raw_json) {
          const ocr = inv.ocr_raw_json as any;
          if (ocr.vendor_name) {
            console.log(`  OCR Vendor: "${ocr.vendor_name}"`);
          }
        }
        console.log();
      }
    }
  }

  // Find Delilah Data LLC vendor
  const { data: delilahVendor } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Delilah Data%')
    .single();

  if (delilahVendor) {
    const { data: delilahInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, storage_path, ocr_raw_json')
      .eq('vendor_id', delilahVendor.id);

    if (delilahInvoices && delilahInvoices.length > 0) {
      console.log(`📋 Delilah Data LLC - ${delilahInvoices.length} invoice(s):\n`);

      for (const inv of delilahInvoices) {
        console.log(`Invoice #${inv.invoice_number} - ${inv.invoice_date} - $${inv.total_amount}`);
        console.log(`  Storage: ${inv.storage_path}`);

        // Try to extract vendor from OCR
        if (inv.ocr_raw_json) {
          const ocr = inv.ocr_raw_json as any;
          if (ocr.vendor_name) {
            console.log(`  OCR Vendor: "${ocr.vendor_name}"`);
          }
        }
        console.log();
      }
    }
  }

  console.log('═'.repeat(80));
  console.log('\n💡 Recommendations:');
  console.log('1. Review the storage paths/PDFs to identify actual vendors');
  console.log('2. Look at invoice numbers for patterns (e.g., 5XXXXX = Ben E Keith)');
  console.log('3. Update invoices with correct vendor_id');
  console.log('4. Delete UNKNOWN and Delilah Data LLC vendors\n');
}

fixUnknownVendors().catch(console.error);
