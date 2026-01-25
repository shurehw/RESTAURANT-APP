/**
 * Repair invoices that have lineItems in OCR but no lines in database
 * This script re-processes the OCR data and inserts the missing line items
 */

import { createAdminClient } from '@/lib/supabase/server';
import { normalizeOCR } from '@/lib/ocr/normalize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function repairMissingLines() {
  const supabase = createAdminClient();

  console.log('\n🔧 REPAIRING INVOICES WITH MISSING LINE ITEMS\n');
  console.log('═'.repeat(80));

  // Get invoices with OCR data but no lines in DB
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      total_amount,
      vendor_id,
      ocr_raw_json,
      vendors!inner(name)
    `)
    .not('ocr_raw_json', 'is', null)
    .order('created_at', { ascending: false });

  if (!invoices) {
    console.log('No invoices found');
    return;
  }

  // Get invoice line counts
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id');

  const invoiceIdsWithLines = new Set(lines?.map(l => l.invoice_id));

  // Find invoices with lineItems in OCR but no DB lines
  const repairableInvoices = invoices.filter(inv => {
    if (invoiceIdsWithLines.has(inv.id)) return false;
    if (!inv.total_amount || inv.total_amount <= 0) return false;
    if (!inv.ocr_raw_json) return false;

    const ocr = inv.ocr_raw_json;
    // Has lineItems array with items
    return ocr.lineItems && Array.isArray(ocr.lineItems) && ocr.lineItems.length > 0;
  });

  console.log(`Found ${repairableInvoices.length} invoices that can be repaired\n`);

  if (repairableInvoices.length === 0) {
    console.log('✅ No invoices need repair');
    return;
  }

  // Show what we'll repair
  console.log('📋 INVOICES TO REPAIR:\n');
  repairableInvoices.forEach((inv, idx) => {
    const lineCount = inv.ocr_raw_json.lineItems?.length || 0;
    console.log(`${idx + 1}. Invoice #${inv.invoice_number}`);
    console.log(`   Vendor: ${(inv.vendors as any)?.name}`);
    console.log(`   Total: $${inv.total_amount.toFixed(2)}`);
    console.log(`   OCR Line Items: ${lineCount}`);
  });

  console.log('\n' + '─'.repeat(80));
  console.log('\n🔨 Starting repair process...\n');

  let successCount = 0;
  let failCount = 0;
  const errors: any[] = [];

  for (const inv of repairableInvoices) {
    try {
      const ocrData = inv.ocr_raw_json;
      const lineItems = ocrData.lineItems;

      console.log(`\nProcessing Invoice #${inv.invoice_number} (${lineItems.length} lines)...`);

      // Insert each line item
      for (const line of lineItems) {
        const lineData = {
          invoice_id: inv.id,
          item_id: null, // We'll let them map manually
          vendor_item_code: line.itemCode || null,
          description: line.description || 'Unknown Item',
          qty: line.qty || 0,
          unit_cost: line.unitPrice || 0,
          ocr_confidence: line.confidence || 0.5,
        };

        const { error: lineError } = await supabase
          .from('invoice_lines')
          .insert(lineData);

        if (lineError) {
          console.error(`  ❌ Failed to insert line: ${line.description}`);
          console.error(`     Error: ${lineError.message}`);
          throw lineError;
        }
      }

      console.log(`  ✅ Successfully inserted ${lineItems.length} lines`);
      successCount++;

    } catch (error: any) {
      console.error(`  ❌ Failed to repair invoice #${inv.invoice_number}`);
      console.error(`     Error: ${error.message || error}`);
      failCount++;
      errors.push({
        invoice_number: inv.invoice_number,
        error: error.message || error,
      });
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 REPAIR SUMMARY:\n');
  console.log(`Total invoices processed: ${repairableInvoices.length}`);
  console.log(`Successfully repaired: ${successCount}`);
  console.log(`Failed: ${failCount}`);

  if (errors.length > 0) {
    console.log('\n❌ ERRORS:\n');
    errors.forEach(err => {
      console.log(`  - Invoice #${err.invoice_number}: ${err.error}`);
    });
  }

  console.log('\n✅ Repair complete!');
  console.log('═'.repeat(80));
}

repairMissingLines()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
