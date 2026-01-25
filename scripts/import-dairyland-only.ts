import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF, extractInvoiceWithClaude } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOOD_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food';
const VENUE_NAME = 'Delilah Dallas';

async function getVenueId(): Promise<string> {
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', `%${VENUE_NAME}%`);

  if (venues && venues.length > 0) {
    return venues[0].id;
  }

  throw new Error('Venue not found');
}

async function importInvoice(filePath: string, fileName: string, venueId: string) {
  console.log(`\n📄 Processing: ${fileName}`);
  console.log('─'.repeat(70));

  try {
    const fileData = await readFile(filePath);
    const fileSizeMB = (fileData.length / 1024 / 1024).toFixed(2);
    console.log(`  Size: ${fileSizeMB} MB`);

    // Extract invoice data
    console.log('  🔍 Running OCR...');
    let rawInvoice;

    if (fileName.toLowerCase().endsWith('.pdf')) {
      const result = await extractInvoiceFromPDF(fileData);
      rawInvoice = result.invoice;
    } else {
      const mimeType = fileName.toLowerCase().endsWith('.jpeg') || fileName.toLowerCase().endsWith('.jpg')
        ? 'image/jpeg'
        : 'image/png';
      const result = await extractInvoiceWithClaude(fileData, mimeType);
      rawInvoice = result.invoice;
    }

    console.log(`  ✅ OCR complete: ${rawInvoice.lineItems.length} line items`);

    // Normalize and match
    console.log('  🔄 Normalizing and matching...');
    const normalized = await normalizeOCR(rawInvoice, supabase);

    if (!normalized.vendorId) {
      console.log(`  ❌ Vendor "${rawInvoice.vendor}" not found - skipping`);
      return { success: false, reason: 'Vendor not found' };
    }

    console.log(`  ✅ Vendor: ${normalized.vendorName}`);
    console.log(`  ✅ Venue: ${normalized.venueName || 'N/A'}`);

    // Upload to storage
    console.log('  📤 Uploading to storage...');
    const timestamp = Date.now();
    const storagePath = `uploads/${timestamp}-${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('opsos-invoices')
      .upload(storagePath, fileData, {
        contentType: fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.log(`  ❌ Upload failed: ${uploadError.message}`);
      return { success: false, reason: uploadError.message };
    }

    console.log(`  ✅ Uploaded: ${storagePath}`);

    // Create invoice record
    console.log('  💾 Creating invoice record...');
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        venue_id: venueId,
        vendor_id: normalized.vendorId,
        invoice_number: normalized.invoiceNumber,
        invoice_date: normalized.invoiceDate,
        due_date: normalized.dueDate,
        payment_terms: normalized.paymentTerms,
        total_amount: normalized.totalAmount,
        storage_path: storagePath,
        ocr_confidence: normalized.ocrConfidence,
        status: 'draft'
      })
      .select()
      .single();

    if (invoiceError) {
      console.log(`  ❌ Failed to create invoice: ${invoiceError.message}`);
      return { success: false, reason: invoiceError.message };
    }

    console.log(`  ✅ Invoice created: ${invoice.id}`);

    // Create line items
    console.log('  📝 Creating line items...');
    const lineItems = normalized.lines.map((line) => ({
      invoice_id: invoice.id,
      description: line.description,
      qty: line.qty,
      unit_cost: line.unitCost,
      item_id: line.itemId || null,
      ocr_confidence: line.ocrConfidence
    }));

    const { error: linesError } = await supabase
      .from('invoice_lines')
      .insert(lineItems);

    if (linesError) {
      console.log(`  ❌ Failed to create line items: ${linesError.message}`);
      return { success: false, reason: linesError.message };
    }

    const matched = normalized.lines.filter(l => l.itemId).length;
    const unmatched = normalized.lines.filter(l => !l.itemId).length;

    console.log(`  ✅ Created ${lineItems.length} line items`);
    console.log(`     Matched: ${matched} | Unmatched: ${unmatched}`);

    return { success: true, matched, unmatched, total: lineItems.length };

  } catch (error) {
    console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { success: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function main() {
  console.log('🥛 Importing Dairyland Invoices');
  console.log('═'.repeat(70));

  const venueId = await getVenueId();
  console.log(`Venue: Delilah Dallas (${venueId})\n`);

  const files = await readdir(FOOD_FOLDER);
  const dairylandFiles = files.filter(f =>
    f.toLowerCase().includes('dairyland') ||
    f.toLowerCase().includes('image (4)')
  );

  console.log(`Found ${dairylandFiles.length} Dairyland files to import\n`);

  let successCount = 0;
  let failCount = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;

  for (const file of dairylandFiles) {
    const filePath = join(FOOD_FOLDER, file);
    const result = await importInvoice(filePath, file, venueId);

    if (result.success) {
      successCount++;
      totalMatched += result.matched || 0;
      totalUnmatched += result.unmatched || 0;
    } else {
      failCount++;
    }
  }

  console.log('\n\n📊 IMPORT SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total files: ${dairylandFiles.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`\nLine items:`);
  console.log(`  Matched: ${totalMatched}`);
  console.log(`  Unmatched: ${totalUnmatched} (need item creation)`);
  console.log(`  Total: ${totalMatched + totalUnmatched}`);

  console.log('\n✨ Import complete!');
}

main();
