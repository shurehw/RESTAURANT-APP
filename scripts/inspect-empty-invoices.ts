import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectEmptyInvoices() {
  console.log('🔍 Inspecting Empty Invoices\n');
  console.log('═'.repeat(80));

  // Get recent invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_name, total_amount, status, created_at, ocr_raw_json, ocr_confidence, ocr_status')
    .order('created_at', { ascending: false })
    .limit(100);

  if (!invoices) {
    console.log('❌ No invoices found');
    return;
  }

  // Get invoice lines
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, id');

  const invoiceIdsWithLines = new Set(lines?.map(l => l.invoice_id));
  const emptyInvoices = invoices.filter(i => !invoiceIdsWithLines.has(i.id));

  console.log(`\n📊 Total recent invoices: ${invoices.length}`);
  console.log(`📊 Empty invoices (no line items): ${emptyInvoices.length}\n`);

  if (emptyInvoices.length === 0) {
    console.log('✅ No empty invoices found in recent uploads');
    return;
  }

  // Analyze a few empty invoices
  console.log('🔍 Analyzing first 10 empty invoices:\n');
  console.log('─'.repeat(80));

  for (let i = 0; i < Math.min(10, emptyInvoices.length); i++) {
    const inv = emptyInvoices[i];
    console.log(`\n${i + 1}. Invoice #${inv.invoice_number}`);
    console.log(`   Vendor: ${inv.vendor_name || 'Unknown'}`);
    console.log(`   Total: $${inv.total_amount}`);
    console.log(`   Status: ${inv.status || 'none'}`);
    console.log(`   OCR Status: ${inv.ocr_status || 'none'}`);
    console.log(`   OCR Confidence: ${inv.ocr_confidence || 'none'}`);
    console.log(`   Created: ${new Date(inv.created_at).toLocaleString()}`);

    const ocrData = inv.ocr_raw_json;
    if (ocrData) {
      if (ocrData.lines && Array.isArray(ocrData.lines)) {
        console.log(`   ✅ Lines in OCR data: ${ocrData.lines.length}`);
        if (ocrData.lines.length > 0) {
          console.log(`   📄 First 3 lines from OCR:`);
          ocrData.lines.slice(0, 3).forEach((line: any, idx: number) => {
            console.log(`      ${idx + 1}. ${line.description || 'No description'}`);
            console.log(`         Qty: ${line.qty} x $${line.unitCost} = $${line.lineTotal}`);
          });
        } else {
          console.log(`   ⚠️  OCR data has lines array but it's empty`);
        }
      } else {
        console.log(`   ❌ No lines array in OCR data`);
        console.log(`   OCR keys: ${Object.keys(ocrData).join(', ')}`);
      }
    } else {
      console.log(`   ❌ No OCR data at all`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n💡 DIAGNOSIS:\n');

  // Categorize the issues
  const hasOcrLinesButNoDbLines = emptyInvoices.filter(inv => {
    const ocrData = inv.ocr_raw_json;
    return ocrData?.lines && Array.isArray(ocrData.lines) && ocrData.lines.length > 0;
  });

  const hasEmptyOcrLines = emptyInvoices.filter(inv => {
    const ocrData = inv.ocr_raw_json;
    return ocrData?.lines && Array.isArray(ocrData.lines) && ocrData.lines.length === 0;
  });

  const hasNoOcrData = emptyInvoices.filter(inv => !inv.ocr_raw_json || !inv.ocr_raw_json.lines);

  console.log(`1. Has OCR lines but NOT in database: ${hasOcrLinesButNoDbLines.length}`);
  console.log(`   → This suggests the RPC function failed to insert lines\n`);

  console.log(`2. Has empty lines array in OCR: ${hasEmptyOcrLines.length}`);
  console.log(`   → OCR extraction failed to find line items\n`);

  console.log(`3. Has no OCR data at all: ${hasNoOcrData.length}`);
  console.log(`   → Invoice created without OCR processing\n`);

  if (hasOcrLinesButNoDbLines.length > 0) {
    console.log('⚠️  CRITICAL: ' + hasOcrLinesButNoDbLines.length + ' invoices have OCR data but lines weren\'t inserted!');
    console.log('This indicates a problem with the create_invoice_with_lines RPC function.\n');
  }
}

inspectEmptyInvoices();
