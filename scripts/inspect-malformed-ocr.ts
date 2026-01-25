/**
 * Inspect invoices with malformed OCR data (Category 3)
 */

import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function inspectMalformedOCR() {
  const supabase = createAdminClient();

  console.log('\n🔍 INSPECTING MALFORMED OCR DATA\n');
  console.log('═'.repeat(80));

  // Get all invoices with OCR data
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      total_amount,
      status,
      created_at,
      ocr_raw_json,
      vendors!inner(name)
    `)
    .not('ocr_raw_json', 'is', null)
    .order('created_at', { ascending: false });

  if (!invoices) {
    console.log('No invoices found');
    return;
  }

  // Get invoices with no lines
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id');

  const invoiceIdsWithLines = new Set(lines?.map(l => l.invoice_id));

  // Find invoices with OCR data but no lines in DB
  const malformedOcr = invoices.filter(inv => {
    if (invoiceIdsWithLines.has(inv.id)) return false;
    if (!inv.total_amount || inv.total_amount <= 0) return false;
    if (!inv.ocr_raw_json) return false;

    // Has OCR data but missing 'lines' field or it's not an array
    return !inv.ocr_raw_json.lines || !Array.isArray(inv.ocr_raw_json.lines);
  });

  console.log(`Found ${malformedOcr.length} invoices with malformed OCR data\n`);

  if (malformedOcr.length === 0) {
    console.log('✅ No malformed OCR data found');
    return;
  }

  malformedOcr.forEach((inv, idx) => {
    console.log(`\n${idx + 1}. Invoice #${inv.invoice_number}`);
    console.log(`   Vendor: ${(inv.vendors as any)?.name}`);
    console.log(`   Total: $${inv.total_amount}`);
    console.log(`   Status: ${inv.status}`);
    console.log(`   Created: ${new Date(inv.created_at).toLocaleDateString()}`);

    const ocr = inv.ocr_raw_json;
    console.log(`\n   OCR Data Structure:`);
    console.log(`   - Keys: ${Object.keys(ocr).join(', ')}`);
    console.log(`   - Has 'lines': ${!!ocr.lines}`);

    if (ocr.lines) {
      console.log(`   - Is Array: ${Array.isArray(ocr.lines)}`);
      console.log(`   - Type: ${typeof ocr.lines}`);
      console.log(`   - Value: ${JSON.stringify(ocr.lines).substring(0, 200)}`);
    }

    // Check for alternative structures
    if (ocr.lineItems) {
      console.log(`   ⚠️  Found 'lineItems' instead of 'lines': ${Array.isArray(ocr.lineItems)}`);
    }
    if (ocr.items) {
      console.log(`   ⚠️  Found 'items' instead of 'lines': ${Array.isArray(ocr.items)}`);
    }

    console.log('   ─'.repeat(40));
  });
}

inspectMalformedOCR()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
