/**
 * Check the OCR raw JSON for specific invoices to see what happened
 */

import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkSpecificInvoices() {
  const supabase = createAdminClient();

  // Check a few specific invoices
  const invoiceNumbers = ['06786764', '70875013', '195469', '186269', '4659491771'];

  console.log('\n🔍 CHECKING SPECIFIC INVOICES\n');
  console.log('═'.repeat(80));

  for (const invNum of invoiceNumbers) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        total_amount,
        ocr_raw_json,
        ocr_confidence,
        storage_path,
        vendors!inner(name)
      `)
      .eq('invoice_number', invNum)
      .single();

    if (!invoice) {
      console.log(`\n❌ Invoice #${invNum} not found`);
      continue;
    }

    console.log(`\n📋 Invoice #${invoice.invoice_number}`);
    console.log(`   Vendor: ${(invoice.vendors as any)?.name}`);
    console.log(`   Total: $${invoice.total_amount}`);
    console.log(`   OCR Confidence: ${invoice.ocr_confidence || 'none'}`);
    console.log(`   Storage Path: ${invoice.storage_path || 'none'}`);

    if (invoice.ocr_raw_json) {
      console.log(`\n   OCR Raw JSON:`);
      console.log(`   - Type: ${typeof invoice.ocr_raw_json}`);
      console.log(`   - Keys: ${Object.keys(invoice.ocr_raw_json).join(', ')}`);

      if (invoice.ocr_raw_json.lineItems) {
        console.log(`   - Has lineItems: ✓ (${invoice.ocr_raw_json.lineItems.length} items)`);
      } else if (invoice.ocr_raw_json.lines) {
        console.log(`   - Has lines: ✓ (${invoice.ocr_raw_json.lines.length} items)`);
      } else {
        console.log(`   - Has line items: ✗`);
      }

      // Show full structure (first 500 chars)
      const jsonStr = JSON.stringify(invoice.ocr_raw_json, null, 2);
      console.log(`\n   First 500 chars of OCR data:`);
      console.log('   ' + jsonStr.substring(0, 500).split('\n').join('\n   '));
    } else {
      console.log(`\n   ❌ NO OCR DATA`);
    }

    console.log('\n' + '─'.repeat(80));
  }
}

checkSpecificInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
