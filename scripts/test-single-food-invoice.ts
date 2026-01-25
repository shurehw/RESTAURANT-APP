import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TEST_FILE = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food\\Invoice dairyland.pdf';

async function testInvoice() {
  console.log('🧪 Testing single food invoice import');
  console.log('═'.repeat(70));
  console.log(`File: Invoice dairyland.pdf\n`);

  try {
    // Read PDF
    const pdfData = await readFile(TEST_FILE);
    console.log(`✅ File loaded (${(pdfData.length / 1024).toFixed(2)} KB)\n`);

    // Extract with OCR
    console.log('🔍 Running OCR...');
    const { invoice: rawInvoice } = await extractInvoiceFromPDF(pdfData);

    console.log('\n📊 OCR Results:');
    console.log('═'.repeat(70));
    console.log(`Vendor: ${rawInvoice.vendor}`);
    console.log(`Invoice #: ${rawInvoice.invoiceNumber || 'N/A'}`);
    console.log(`Date: ${rawInvoice.invoiceDate}`);
    console.log(`Total: $${rawInvoice.totalAmount.toFixed(2)}`);
    console.log(`Confidence: ${(rawInvoice.confidence * 100).toFixed(1)}%`);
    console.log(`Line items: ${rawInvoice.lineItems.length}\n`);

    // Show first 10 line items
    console.log('📋 Line Items (first 10):');
    console.log('═'.repeat(70));
    rawInvoice.lineItems.slice(0, 10).forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.description}`);
      console.log(`   Qty: ${item.qty} | Unit: $${item.unitPrice.toFixed(2)} | Total: $${item.lineTotal.toFixed(2)}`);
    });

    if (rawInvoice.lineItems.length > 10) {
      console.log(`\n... and ${rawInvoice.lineItems.length - 10} more items`);
    }

    // Normalize
    console.log('\n\n🔄 Normalizing invoice data...');
    const normalized = await normalizeOCR(rawInvoice, supabase);

    console.log('\n✅ Normalization complete');
    console.log('═'.repeat(70));
    console.log(`Vendor: ${normalized.vendorName} ${normalized.vendorId ? `(ID: ${normalized.vendorId})` : '❌ NOT FOUND'}`);
    console.log(`Venue: ${normalized.venueName || 'N/A'} ${normalized.venueId ? `(ID: ${normalized.venueId})` : ''}`);

    if (normalized.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      normalized.warnings.forEach(w => console.log(`  - ${w}`));
    }

    // Count matched vs unmatched
    const matched = normalized.lines.filter(l => l.itemId).length;
    const unmatched = normalized.lines.filter(l => !l.itemId).length;

    console.log('\n\n📈 Matching Results:');
    console.log('═'.repeat(70));
    console.log(`Total lines: ${normalized.lines.length}`);
    console.log(`✅ Matched: ${matched} (${((matched / normalized.lines.length) * 100).toFixed(1)}%)`);
    console.log(`❌ Unmatched: ${unmatched} (${((unmatched / normalized.lines.length) * 100).toFixed(1)}%)`);

    console.log('\n\n💡 Analysis:');
    console.log('═'.repeat(70));
    if (rawInvoice.lineItems.length > 50) {
      console.log(`⚠️  This PDF contains ${rawInvoice.lineItems.length} line items!`);
      console.log(`   This might be multiple invoices combined into one PDF.`);
    } else {
      console.log(`✅ This appears to be a single invoice (${rawInvoice.lineItems.length} items).`);
    }

    if (!normalized.vendorId) {
      console.log(`\n❌ Vendor "${rawInvoice.vendor}" not found in system.`);
      console.log(`   Create vendor first before importing.`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

testInvoice();
