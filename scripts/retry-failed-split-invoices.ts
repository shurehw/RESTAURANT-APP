import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SPLIT_FOLDER = 'C:\\Users\\JacobShure\\Downloads\\delilah_dallas_invoices__food_1_split';
const DELAY_MS = 2000; // 2 second delay between requests to avoid rate limits

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.'()]/g, '')
    .replace(/\b(llc|inc|corp|ltd|company|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function importInvoice(filePath: string, fileName: string, venueId: string) {
  try {
    const fileData = await readFile(filePath);

    // Extract and normalize
    const { invoice: rawInvoice } = await extractInvoiceFromPDF(fileData);
    const normalized = await normalizeOCR(rawInvoice, supabase);

    // Get or create vendor
    const normalizedVendorName = normalizeVendorName(normalized.vendorName);
    let { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('normalized_name', normalizedVendorName)
      .maybeSingle();

    if (!vendor) {
      const { data: newVendor, error: vendorError } = await supabase
        .from('vendors')
        .insert({
          name: normalized.vendorName,
          normalized_name: normalizedVendorName,
          is_active: true,
          payment_terms_days: 30
        })
        .select()
        .single();

      if (vendorError) {
        return { success: false, reason: 'vendor_create_failed', error: vendorError.message };
      }
      vendor = newVendor;
    }

    // Check for duplicate
    if (normalized.invoiceNumber) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('invoice_number', normalized.invoiceNumber)
        .eq('vendor_id', vendor.id)
        .maybeSingle();

      if (existing) {
        return { success: false, reason: 'duplicate', invoiceNumber: normalized.invoiceNumber };
      }
    }

    // Upload to storage
    const timestamp = Date.now();
    const storagePath = `invoices/${venueId}/${timestamp}-${fileName}`;

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
        vendor_id: vendor.id,
        invoice_number: normalized.invoiceNumber,
        invoice_date: normalized.invoiceDate,
        due_date: normalized.dueDate,
        total_amount: normalized.totalAmount,
        storage_path: storagePath,
        ocr_confidence: 0.85
      })
      .select()
      .single();

    if (invoiceError) {
      return { success: false, reason: 'invoice_create_failed', error: invoiceError.message };
    }

    // Create lines
    const lineItems = normalized.lines
      .filter(line => line.qty != null && line.unitCost != null)
      .map((line) => ({
        invoice_id: invoice.id,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unitCost,
        item_id: line.itemId || null,
        ocr_confidence: line.ocrConfidence
      }));

    if (lineItems.length === 0) {
      return { success: false, reason: 'no_valid_lines' };
    }

    const { error: linesError } = await supabase
      .from('invoice_lines')
      .insert(lineItems);

    if (linesError) {
      return { success: false, reason: 'lines_create_failed', error: linesError.message };
    }

    const matched = normalized.lines.filter(l => l.itemId).length;

    return {
      success: true,
      vendor: normalized.vendorName,
      invoiceNumber: normalized.invoiceNumber,
      lines: lineItems.length,
      matched,
      unmatched: lineItems.length - matched
    };
  } catch (error: any) {
    return { success: false, reason: 'error', error: error.message };
  }
}

async function main() {
  console.log('🔄 RETRYING FAILED INVOICES (with rate limiting)');
  console.log('═'.repeat(70));

  const venueId = await getVenueId();
  console.log(`Venue: Delilah Dallas (${venueId})\n`);

  const allFiles = (await readdir(SPLIT_FOLDER)).filter(f => f.toLowerCase().endsWith('.pdf')).sort();

  // Start from New3_page2 (first failure)
  const startIndex = allFiles.findIndex(f => f === 'New3_page2.pdf');
  const filesToRetry = allFiles.slice(startIndex);

  console.log(`Retrying ${filesToRetry.length} files (starting from ${filesToRetry[0]})\n`);

  let imported = 0;
  let duplicates = 0;
  let failed = 0;
  let totalLines = 0;
  let totalMatched = 0;

  for (let i = 0; i < filesToRetry.length; i++) {
    const fileName = filesToRetry[i];
    const filePath = join(SPLIT_FOLDER, fileName);

    process.stdout.write(`[${i + 1}/${filesToRetry.length}] ${fileName}...`);

    const result = await importInvoice(filePath, fileName, venueId);

    if (result.success) {
      console.log(` ✅ ${result.vendor} #${result.invoiceNumber} (${result.lines} lines)`);
      imported++;
      totalLines += result.lines;
      totalMatched += result.matched;
    } else if (result.reason === 'duplicate') {
      console.log(` ⏭️  Duplicate`);
      duplicates++;
    } else {
      console.log(` ❌ ${result.reason}`);
      failed++;
    }

    // Add delay between requests to avoid rate limiting
    if (i < filesToRetry.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n📊 RETRY SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Duplicates: ${duplicates}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\nLine items: ${totalLines} (${totalMatched} matched, ${totalLines - totalMatched} new)`);
}

main();
