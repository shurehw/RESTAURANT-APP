import { createClient } from '@supabase/supabase-js';
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHUNKS_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Small';
const MAX_MB = 10; // Only import files under 10MB

async function getVenueId(): Promise<string> {
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%Delilah Dallas%');

  if (venues && venues.length > 0) {
    return venues[0].id;
  }

  throw new Error('Venue not found');
}

async function importChunk(filePath: string, fileName: string, venueId: string) {
  try {
    const fileData = await readFile(filePath);
    const fileSizeMB = fileData.length / 1024 / 1024;

    // Skip if too large
    if (fileSizeMB > MAX_MB) {
      return { success: false, reason: 'too_large', size: fileSizeMB };
    }

    // OCR
    const { invoice: rawInvoice } = await extractInvoiceFromPDF(fileData);

    // Normalize
    const normalized = await normalizeOCR(rawInvoice, supabase);

    if (!normalized.vendorId) {
      return { success: false, reason: 'vendor_not_found', vendor: rawInvoice.vendor };
    }

    // Upload
    const timestamp = Date.now();
    const storagePath = `uploads/${timestamp}-${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('opsos-invoices')
      .upload(storagePath, fileData, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      return { success: false, reason: 'upload_failed', error: uploadError.message };
    }

    // Create invoice
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
      return { success: false, reason: 'invoice_create_failed', error: invoiceError.message };
    }

    // Create lines
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
      return { success: false, reason: 'lines_create_failed', error: linesError.message };
    }

    const matched = normalized.lines.filter(l => l.itemId).length;
    const unmatched = normalized.lines.filter(l => !l.itemId).length;

    return {
      success: true,
      vendor: normalized.vendorName,
      lines: lineItems.length,
      matched,
      unmatched
    };

  } catch (error) {
    return {
      success: false,
      reason: 'error',
      error: error instanceof Error ? error.message : 'Unknown'
    };
  }
}

async function main() {
  console.log('🍽️  Importing Small Food Invoice Chunks (<10MB)');
  console.log('═'.repeat(70));

  const venueId = await getVenueId();
  console.log(`Venue: Delilah Dallas (${venueId})\n`);

  const folders = await readdir(CHUNKS_FOLDER);

  let totalProcessed = 0;
  let totalSuccess = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalLines = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;

  const vendorNotFound = new Set<string>();

  for (const folder of folders.slice(0, 3)) { // Test with first 3 folders
    console.log(`\n📁 ${folder}`);
    const folderPath = join(CHUNKS_FOLDER, folder);
    const files = (await readdir(folderPath)).filter(f => f.toLowerCase().endsWith('.pdf'));

    for (const file of files) {
      totalProcessed++;
      const filePath = join(folderPath, file);
      const fileStat = await stat(filePath);
      const sizeMB = (fileStat.size / 1024 / 1024).toFixed(2);

      process.stdout.write(`  ${file} (${sizeMB}MB)... `);

      const result = await importChunk(filePath, file, venueId);

      if (result.success) {
        totalSuccess++;
        totalLines += result.lines || 0;
        totalMatched += result.matched || 0;
        totalUnmatched += result.unmatched || 0;
        console.log(`✅ ${result.vendor} (${result.lines} lines, ${result.matched} matched)`);
      } else if (result.reason === 'too_large') {
        totalSkipped++;
        console.log(`⏭️  Skipped (${result.size?.toFixed(2)}MB > ${MAX_MB}MB)`);
      } else if (result.reason === 'vendor_not_found') {
        totalFailed++;
        vendorNotFound.add(result.vendor || 'Unknown');
        console.log(`❌ Vendor not found: ${result.vendor}`);
      } else {
        totalFailed++;
        console.log(`❌ ${result.reason}: ${result.error || ''}`);
      }
    }
  }

  console.log('\n\n📊 IMPORT SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Processed: ${totalProcessed}`);
  console.log(`✅ Imported: ${totalSuccess}`);
  console.log(`⏭️  Skipped (too large): ${totalSkipped}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`\nLine items:`);
  console.log(`  Total: ${totalLines}`);
  console.log(`  Matched: ${totalMatched}`);
  console.log(`  Unmatched: ${totalUnmatched}`);

  if (vendorNotFound.size > 0) {
    console.log(`\n⚠️  Missing vendors (${vendorNotFound.size}):`);
    Array.from(vendorNotFound).forEach(v => console.log(`  - ${v}`));
    console.log('\nCreate these vendors first, then re-run import.');
  }
}

main();
