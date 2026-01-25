import { createClient } from '@supabase/supabase-js';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SOURCE_FOLDER = 'C:\\Users\\JacobShure\\Downloads\\delilah_dallas_invoices__food_1';
const SPLIT_FOLDER = 'C:\\Users\\JacobShure\\Downloads\\delilah_dallas_invoices__food_1_split';

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

async function splitPDF(inputPath: string, fileName: string): Promise<string[]> {
  const pdfBytes = await readFile(inputPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  const baseName = fileName.replace('.pdf', '');
  const outputPaths: string[] = [];

  // Create output folder if needed
  try {
    await mkdir(SPLIT_FOLDER, { recursive: true });
  } catch (e) {}

  // Split each page into separate PDF
  for (let i = 0; i < totalPages; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);

    const outputFileName = `${baseName}_page${i + 1}.pdf`;
    const outputPath = join(SPLIT_FOLDER, outputFileName);

    const pdfBytesOut = await newPdf.save();
    await writeFile(outputPath, pdfBytesOut);

    outputPaths.push(outputPath);
  }

  return outputPaths;
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
  console.log('📄 SPLITTING & IMPORTING MULTI-INVOICE PDFs');
  console.log('═'.repeat(70));

  const venueId = await getVenueId();
  console.log(`Venue: Delilah Dallas (${venueId})\n`);

  const files = (await readdir(SOURCE_FOLDER)).filter(f => f.toLowerCase().endsWith('.pdf'));

  console.log('STEP 1: SPLITTING PDFs');
  console.log('─'.repeat(70));

  const allSplitFiles: Array<{ path: string; fileName: string }> = [];

  for (const file of files) {
    const filePath = join(SOURCE_FOLDER, file);
    console.log(`📄 ${file}...`);

    const splitPaths = await splitPDF(filePath, file);
    console.log(`  ✅ Split into ${splitPaths.length} invoices`);

    splitPaths.forEach(path => {
      allSplitFiles.push({
        path,
        fileName: path.split('\\').pop() || ''
      });
    });
  }

  console.log(`\nTotal split invoices: ${allSplitFiles.length}\n`);

  console.log('STEP 2: IMPORTING INVOICES');
  console.log('─'.repeat(70));

  let imported = 0;
  let duplicates = 0;
  let failed = 0;
  let totalLines = 0;
  let totalMatched = 0;
  const newVendors = new Set<string>();

  for (const { path, fileName } of allSplitFiles) {
    process.stdout.write(`${fileName}...`);

    const result = await importInvoice(path, fileName, venueId);

    if (result.success) {
      console.log(` ✅ ${result.vendor} #${result.invoiceNumber} (${result.lines} lines)`);
      imported++;
      totalLines += result.lines;
      totalMatched += result.matched;
    } else if (result.reason === 'duplicate') {
      console.log(` ⏭️  Duplicate #${result.invoiceNumber}`);
      duplicates++;
    } else {
      console.log(` ❌ ${result.reason}: ${result.error || ''}`);
      failed++;
    }
  }

  console.log('\n📊 FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total PDFs processed: ${files.length}`);
  console.log(`Total invoices split: ${allSplitFiles.length}`);
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Duplicates: ${duplicates}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\nLine items: ${totalLines} (${totalMatched} matched, ${totalLines - totalMatched} new)`);
}

main();
