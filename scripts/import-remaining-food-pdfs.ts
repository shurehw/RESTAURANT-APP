import { createAdminClient } from '@/lib/supabase/server';
import { extractInvoiceFromPDF } from '@/lib/ocr/claude';
import { normalizeOCR } from '@/lib/ocr/normalize';
import { matchVendor } from '@/lib/services/vendor-matching';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const INVOICE_DIR = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Small';
const VENUE_NAME = 'Delilah Dallas';

async function importRemainingFoodPDFs() {
  const supabase = createAdminClient();

  // Get venue
  const { data: venue } = await supabase
    .from('venues')
    .select('id')
    .ilike('name', `%${VENUE_NAME}%`)
    .single();

  if (!venue) {
    console.log(`❌ Venue "${VENUE_NAME}" not found`);
    return;
  }

  console.log(`\n📍 Venue: ${VENUE_NAME} (${venue.id})\n`);

  // Get all PDF files
  const files = fs.readdirSync(INVOICE_DIR)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort();

  console.log(`📁 Found ${files.length} PDF files\n`);

  let imported = 0;
  let failed = 0;
  let duplicates = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(INVOICE_DIR, filename);

    console.log(`[${i + 1}/${files.length}] ${filename}...`);

    try {
      // Extract OCR
      const rawOCR = await extractInvoiceFromPDF(filePath);
      const normalized = normalizeOCR(rawOCR);

      // Check for duplicate
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('venue_id', venue.id)
        .eq('invoice_number', normalized.invoiceNumber)
        .single();

      if (existingInvoice) {
        console.log(`  ⏭️  Duplicate #${normalized.invoiceNumber}`);
        duplicates++;
        continue;
      }

      // Match vendor
      const vendorMatch = await matchVendor(normalized.vendor, supabase);

      if (!vendorMatch) {
        console.log(`  ❌ Vendor not found: ${normalized.vendor}`);
        failed++;
        continue;
      }

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .insert({
          venue_id: venue.id,
          vendor_id: vendorMatch.id,
          vendor_name: vendorMatch.name,
          invoice_number: normalized.invoiceNumber,
          invoice_date: normalized.invoiceDate,
          total_amount: normalized.totalAmount,
          status: 'pending'
        })
        .select()
        .single();

      if (invError || !invoice) {
        console.log(`  ❌ Invoice create failed: ${invError?.message}`);
        failed++;
        continue;
      }

      // Create line items
      if (normalized.lineItems.length > 0) {
        const lineItems = normalized.lineItems.map(line => ({
          invoice_id: invoice.id,
          description: line.description,
          quantity: line.qty,
          unit_cost: line.unitPrice,
          line_total: line.lineTotal
        }));

        const { error: linesError } = await supabase
          .from('invoice_lines')
          .insert(lineItems);

        if (linesError) {
          console.log(`  ❌ Line items failed: ${linesError.message}`);
          failed++;
          continue;
        }

        console.log(`  ✅ ${vendorMatch.name} #${normalized.invoiceNumber} (${normalized.lineItems.length} lines)`);
        imported++;
      } else {
        console.log(`  ⚠️  No valid lines`);
        failed++;
      }

    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      failed++;
    }

    // Rate limit - wait 1s between imports
    if (i < files.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n📊 IMPORT SUMMARY:`);
  console.log(`  ✅ Imported: ${imported}`);
  console.log(`  ⏭️  Duplicates: ${duplicates}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📋 Total: ${files.length}`);
}

importRemainingFoodPDFs()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
