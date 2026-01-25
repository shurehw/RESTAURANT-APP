import { createClient } from '@supabase/supabase-js';
import { readdir, readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';
import dotenv from 'dotenv';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHUNKS_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Small';
const MAX_MB = 10;
const COMPRESSED_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food - Compressed';

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

async function compressPDFToImage(pdfPath: string): Promise<Buffer> {
  // Read PDF and convert first page to image
  const pdfBytes = await readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // For now, just return the original PDF and let OCR handle it
  // TODO: Implement actual PDF->Image conversion if needed
  return pdfBytes;
}

async function importCompressedPDF(filePath: string, fileName: string, venueId: string) {
  try {
    console.log(`  Processing ${fileName}...`);

    const fileData = await readFile(filePath);
    const fileSizeMB = fileData.length / 1024 / 1024;

    // Try OCR directly first
    const { invoice: rawInvoice } = await extractInvoiceFromPDF(fileData);
    const normalized = await normalizeOCR(rawInvoice, supabase);

    // Check if vendor exists
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('normalized_name', normalized.vendorName.toLowerCase().replace(/[,\.']/g, '').replace(/\b(llc|inc|corp|ltd|company|co)\b/gi, '').replace(/\s+/g, ' ').trim())
      .maybeSingle();

    if (!vendor) {
      return { success: false, reason: 'vendor_not_found', vendor: normalized.vendorName };
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

    // Create lines (filter out lines with missing qty or unit_cost)
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
      return { success: false, reason: 'no_valid_lines', error: 'All lines have missing qty or unit_cost' };
    }

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
  } catch (error: any) {
    return { success: false, reason: 'error', error: error.message };
  }
}

async function main() {
  console.log('📦 Compressing and Importing Large PDFs');
  console.log('═'.repeat(70));

  const venueId = await getVenueId();
  console.log(`Venue: Delilah Dallas (${venueId})\n`);

  const folders = await readdir(CHUNKS_FOLDER);
  const largeFiles: Array<{ folder: string; file: string; path: string; size: number }> = [];

  // Find all large files
  for (const folder of folders) {
    const folderPath = join(CHUNKS_FOLDER, folder);
    const folderStat = await stat(folderPath);

    if (!folderStat.isDirectory()) continue;

    const files = (await readdir(folderPath)).filter(f => f.toLowerCase().endsWith('.pdf'));

    for (const file of files) {
      const filePath = join(folderPath, file);
      const fileStat = await stat(filePath);
      const sizeMB = fileStat.size / 1024 / 1024;

      if (sizeMB > MAX_MB) {
        largeFiles.push({ folder, file, path: filePath, size: sizeMB });
      }
    }
  }

  console.log(`Found ${largeFiles.length} files over 10MB\n`);

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalLines = 0;
  let totalMatched = 0;
  let totalUnmatched = 0;

  for (const { folder, file, path, size } of largeFiles) {
    console.log(`📁 ${folder}/${file} (${size.toFixed(2)}MB)`);

    const result = await importCompressedPDF(path, file, venueId);

    if (result.success) {
      console.log(`  ✅ ${result.vendor} (${result.lines} lines, ${result.matched} matched)`);
      totalSuccess++;
      totalLines += result.lines;
      totalMatched += result.matched;
      totalUnmatched += result.unmatched;
    } else {
      console.log(`  ❌ ${result.reason}: ${result.error || result.vendor || ''}`);
      totalFailed++;
    }
  }

  console.log('\n📊 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Imported: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`\nLine items:`);
  console.log(`  Total: ${totalLines}`);
  console.log(`  Matched: ${totalMatched}`);
  console.log(`  Unmatched: ${totalUnmatched}`);
}

main();
