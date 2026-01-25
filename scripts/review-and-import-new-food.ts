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

const INVOICE_FOLDER = 'C:\\Users\\JacobShure\\Downloads\\delilah_dallas_invoices__food_1';

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

async function reviewInvoice(filePath: string, fileName: string) {
  try {
    const fileData = await readFile(filePath);

    // Extract invoice data
    const { invoice: rawInvoice } = await extractInvoiceFromPDF(fileData);
    const normalized = await normalizeOCR(rawInvoice, supabase);

    // Check if vendor exists
    const normalizedVendorName = normalizeVendorName(normalized.vendorName);
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('normalized_name', normalizedVendorName)
      .maybeSingle();

    // Check if invoice already exists
    let isDuplicate = false;
    if (normalized.invoiceNumber) {
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, vendor_id')
        .eq('invoice_number', normalized.invoiceNumber)
        .maybeSingle();

      if (existing) {
        isDuplicate = true;
      }
    }

    return {
      fileName,
      vendor: normalized.vendorName,
      normalizedVendor: normalizedVendorName,
      vendorExists: !!vendor,
      vendorId: vendor?.id,
      invoiceNumber: normalized.invoiceNumber,
      invoiceDate: normalized.invoiceDate,
      totalAmount: normalized.totalAmount,
      lineCount: normalized.lines.length,
      isDuplicate,
      fileData,
      normalized
    };
  } catch (error: any) {
    return {
      fileName,
      error: error.message
    };
  }
}

async function importInvoice(review: any, venueId: string) {
  try {
    // Create vendor if needed
    let vendorId = review.vendorId;
    if (!vendorId) {
      const { data: newVendor, error: vendorError } = await supabase
        .from('vendors')
        .insert({
          name: review.vendor,
          normalized_name: review.normalizedVendor,
          is_active: true,
          payment_terms_days: 30
        })
        .select()
        .single();

      if (vendorError) {
        return { success: false, error: `Vendor create failed: ${vendorError.message}` };
      }
      vendorId = newVendor.id;
    }

    // Upload to storage
    const timestamp = Date.now();
    const storagePath = `invoices/${venueId}/${timestamp}-${review.fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('opsos-invoices')
      .upload(storagePath, review.fileData, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        venue_id: venueId,
        vendor_id: vendorId,
        invoice_number: review.normalized.invoiceNumber,
        invoice_date: review.normalized.invoiceDate,
        due_date: review.normalized.dueDate,
        total_amount: review.normalized.totalAmount,
        storage_path: storagePath,
        ocr_confidence: 0.85
      })
      .select()
      .single();

    if (invoiceError) {
      return { success: false, error: `Invoice create failed: ${invoiceError.message}` };
    }

    // Create lines
    const lineItems = review.normalized.lines
      .filter((line: any) => line.qty != null && line.unitCost != null)
      .map((line: any) => ({
        invoice_id: invoice.id,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unitCost,
        item_id: line.itemId || null,
        ocr_confidence: line.ocrConfidence
      }));

    if (lineItems.length === 0) {
      return { success: false, error: 'No valid lines (missing qty/unit_cost)' };
    }

    const { error: linesError } = await supabase
      .from('invoice_lines')
      .insert(lineItems);

    if (linesError) {
      return { success: false, error: `Lines create failed: ${linesError.message}` };
    }

    const matched = review.normalized.lines.filter((l: any) => l.itemId).length;

    return {
      success: true,
      lines: lineItems.length,
      matched,
      unmatched: lineItems.length - matched
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('📋 REVIEWING NEW FOOD INVOICES');
  console.log('═'.repeat(70));

  const venueId = await getVenueId();
  console.log(`Venue: Delilah Dallas (${venueId})\n`);

  const files = (await readdir(INVOICE_FOLDER)).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`Found ${files.length} PDF files\n`);

  console.log('STEP 1: REVIEWING INVOICES');
  console.log('─'.repeat(70));

  const reviews = [];
  for (const file of files) {
    const filePath = join(INVOICE_FOLDER, file);
    console.log(`📄 ${file}...`);
    const review = await reviewInvoice(filePath, file);
    reviews.push(review);

    if (review.error) {
      console.log(`  ❌ Error: ${review.error}`);
    } else {
      console.log(`  Vendor: ${review.vendor} ${review.vendorExists ? '✅' : '⚠️ NEW'}`);
      console.log(`  Invoice: ${review.invoiceNumber || 'N/A'} | Date: ${review.invoiceDate} | Amount: $${review.totalAmount}`);
      console.log(`  Lines: ${review.lineCount} | ${review.isDuplicate ? '⚠️ DUPLICATE' : '✅ NEW'}`);
    }
  }

  // Segregate invoices
  const newInvoices = reviews.filter(r => !r.error && !r.isDuplicate);
  const duplicates = reviews.filter(r => !r.error && r.isDuplicate);
  const errors = reviews.filter(r => r.error);
  const newVendors = newInvoices.filter(r => !r.vendorExists);

  console.log('\n📊 REVIEW SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ New invoices to import: ${newInvoices.length}`);
  console.log(`⚠️  Duplicates (skip): ${duplicates.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log(`🆕 New vendors to create: ${newVendors.length}`);

  if (duplicates.length > 0) {
    console.log('\n⚠️  DUPLICATE INVOICES:');
    duplicates.forEach(r => console.log(`  - ${r.fileName}: ${r.vendor} #${r.invoiceNumber}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ ERROR INVOICES:');
    errors.forEach(r => console.log(`  - ${r.fileName}: ${r.error}`));
  }

  if (newVendors.length > 0) {
    console.log('\n🆕 NEW VENDORS:');
    newVendors.forEach(r => console.log(`  - ${r.vendor} (${r.normalizedVendor})`));
  }

  // Import new invoices
  if (newInvoices.length > 0) {
    console.log('\n\nSTEP 2: IMPORTING NEW INVOICES');
    console.log('─'.repeat(70));

    let imported = 0;
    let failed = 0;
    let totalLines = 0;
    let totalMatched = 0;

    for (const review of newInvoices) {
      console.log(`📄 ${review.fileName}...`);
      const result = await importInvoice(review, venueId);

      if (result.success) {
        console.log(`  ✅ Imported (${result.lines} lines, ${result.matched} matched)`);
        imported++;
        totalLines += result.lines;
        totalMatched += result.matched;
      } else {
        console.log(`  ❌ Failed: ${result.error}`);
        failed++;
      }
    }

    console.log('\n📊 IMPORT SUMMARY');
    console.log('═'.repeat(70));
    console.log(`✅ Imported: ${imported}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Line items: ${totalLines} (${totalMatched} matched)`);
  }
}

main();
