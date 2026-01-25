/**
 * Comprehensive diagnosis of invoices with totals but no line items
 * This script:
 * 1. Finds all invoices with $ totals but no line items
 * 2. Checks if OCR data contains line items
 * 3. Identifies the root cause (OCR failure vs DB insertion failure)
 * 4. Provides actionable recommendations
 */

import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function diagnose() {
  const supabase = createAdminClient();

  console.log('\n🔬 COMPREHENSIVE INVOICE LINE ITEMS DIAGNOSIS\n');
  console.log('═'.repeat(80));

  // Get all invoices with their basic info
  const { data: allInvoices, error: invError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      total_amount,
      status,
      created_at,
      ocr_raw_json,
      ocr_confidence,
      vendors!inner(name)
    `)
    .order('created_at', { ascending: false });

  if (invError) {
    console.error('❌ Error fetching invoices:', invError);
    return;
  }

  console.log(`\n📊 Total invoices in database: ${allInvoices?.length || 0}`);

  // Get all invoice lines
  const { data: allLines, error: linesError } = await supabase
    .from('invoice_lines')
    .select('invoice_id, id, description, qty, unit_cost, line_total');

  if (linesError) {
    console.error('❌ Error fetching lines:', linesError);
    return;
  }

  console.log(`📊 Total invoice lines in database: ${allLines?.length || 0}\n`);

  // Build a map of invoice_id -> line count
  const lineCountByInvoice = new Map<string, number>();
  allLines?.forEach(line => {
    const count = lineCountByInvoice.get(line.invoice_id) || 0;
    lineCountByInvoice.set(line.invoice_id, count + 1);
  });

  // Categorize invoices
  const invoicesWithTotal = allInvoices?.filter(inv => inv.total_amount > 0) || [];
  const emptyInvoices = invoicesWithTotal.filter(inv => !lineCountByInvoice.has(inv.id));

  console.log('═'.repeat(80));
  console.log('\n📈 SUMMARY STATISTICS:\n');
  console.log(`Total invoices with $ amount: ${invoicesWithTotal.length}`);
  console.log(`Invoices WITH line items: ${invoicesWithTotal.length - emptyInvoices.length}`);
  console.log(`Invoices WITHOUT line items: ${emptyInvoices.length}`);

  const emptyValue = emptyInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  console.log(`Total $ value of empty invoices: $${emptyValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

  if (emptyInvoices.length === 0) {
    console.log('\n✅ All invoices have line items!');
    return;
  }

  // Analyze the empty invoices
  console.log('\n' + '═'.repeat(80));
  console.log('\n🔍 ROOT CAUSE ANALYSIS:\n');

  let ocrHasLinesButDbDoesnt = 0;
  let ocrHasEmptyLines = 0;
  let ocrMissingLines = 0;
  let noOcrData = 0;

  const problematicInvoices: any[] = [];

  emptyInvoices.forEach(inv => {
    const ocrData = inv.ocr_raw_json;

    if (!ocrData) {
      noOcrData++;
      return;
    }

    if (!ocrData.lines) {
      ocrMissingLines++;
      return;
    }

    if (!Array.isArray(ocrData.lines)) {
      ocrMissingLines++;
      return;
    }

    if (ocrData.lines.length === 0) {
      ocrHasEmptyLines++;
    } else {
      // This is the critical case: OCR extracted lines but they weren't inserted
      ocrHasLinesButDbDoesnt++;
      problematicInvoices.push({
        ...inv,
        ocrLineCount: ocrData.lines.length
      });
    }
  });

  console.log(`Category 1: OCR extracted lines but DB has none`);
  console.log(`            (RPC function failure)          : ${ocrHasLinesButDbDoesnt} invoices`);
  console.log(`\nCategory 2: OCR found 0 lines`);
  console.log(`            (OCR extraction failure)        : ${ocrHasEmptyLines} invoices`);
  console.log(`\nCategory 3: OCR data missing 'lines' field`);
  console.log(`            (OCR format issue)              : ${ocrMissingLines} invoices`);
  console.log(`\nCategory 4: No OCR data at all`);
  console.log(`            (Manual entry or old data)      : ${noOcrData} invoices`);

  // Show critical cases (Category 1)
  if (problematicInvoices.length > 0) {
    console.log('\n' + '═'.repeat(80));
    console.log('\n🚨 CRITICAL: Invoices with OCR data but no DB lines\n');
    console.log('These invoices had successful OCR extraction but the lines weren\'t inserted.\n');
    console.log('─'.repeat(80));

    problematicInvoices.slice(0, 15).forEach((inv, idx) => {
      console.log(`\n${idx + 1}. Invoice #${inv.invoice_number}`);
      console.log(`   Vendor: ${(inv.vendors as any)?.name || 'Unknown'}`);
      console.log(`   Invoice Total: $${inv.total_amount.toFixed(2)}`);
      console.log(`   OCR Line Count: ${inv.ocrLineCount}`);
      console.log(`   Status: ${inv.status}`);
      console.log(`   OCR Confidence: ${inv.ocr_confidence || 'none'}`);
      console.log(`   Created: ${new Date(inv.created_at).toLocaleString()}`);

      // Show first 3 lines from OCR
      const ocrLines = inv.ocr_raw_json.lines.slice(0, 3);
      console.log(`\n   📄 Sample OCR lines (first 3):`);
      ocrLines.forEach((line: any, i: number) => {
        console.log(`      ${i + 1}. ${line.description || 'No description'}`);
        console.log(`         Qty: ${line.qty} × $${line.unitCost} = $${line.lineTotal || (line.qty * line.unitCost)}`);
      });
    });

    if (problematicInvoices.length > 15) {
      console.log(`\n   ... and ${problematicInvoices.length - 15} more\n`);
    }
  }

  // Recommendations
  console.log('\n' + '═'.repeat(80));
  console.log('\n💡 RECOMMENDATIONS:\n');

  if (ocrHasLinesButDbDoesnt > 0) {
    console.log(`🔧 Category 1 (${ocrHasLinesButDbDoesnt} invoices):`);
    console.log(`   • These invoices have valid OCR data with line items`);
    console.log(`   • The create_invoice_with_lines RPC likely failed silently`);
    console.log(`   • Solution: Create a repair script to re-insert lines from ocr_raw_json\n`);
  }

  if (ocrHasEmptyLines > 0) {
    console.log(`🔧 Category 2 (${ocrHasEmptyLines} invoices):`);
    console.log(`   • OCR failed to extract line items from the PDF/image`);
    console.log(`   • Solution: Re-process these invoices or manually enter data\n`);
  }

  if (ocrMissingLines > 0) {
    console.log(`🔧 Category 3 (${ocrMissingLines} invoices):`);
    console.log(`   • OCR data structure is malformed`);
    console.log(`   • Solution: Check OCR extraction code or re-process\n`);
  }

  if (noOcrData > 0) {
    console.log(`🔧 Category 4 (${noOcrData} invoices):`);
    console.log(`   • These may be manually created or from old imports`);
    console.log(`   • Solution: Review and add lines manually if needed\n`);
  }

  console.log('═'.repeat(80));
  console.log();
}

diagnose()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
