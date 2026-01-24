import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { extractInvoiceFromPDF, extractInvoiceWithClaude } from '../lib/ocr/claude';
import { normalizeOCR } from '../lib/ocr/normalize';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const INVOICE_DIR = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\5310 Liquor. Cost';

// Get venue from command line arg or env var
const VENUE_NAME = process.argv[2] || process.env.VENUE_NAME || 'Delilah Dallas';
const VENUE_ID = process.env.VENUE_ID || '';

async function getVenueId(): Promise<string> {
  if (VENUE_ID) {
    console.log(`Using venue ID from env: ${VENUE_ID}\n`);
    return VENUE_ID;
  }

  // Try to find venue by name
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', `%${VENUE_NAME}%`);

  if (venues && venues.length > 0) {
    console.log(`✅ Found venue: ${venues[0].name} (${venues[0].id})\n`);
    return venues[0].id;
  }

  // List all venues to help user find the right one
  const { data: allVenues } = await supabase
    .from('venues')
    .select('id, name')
    .order('name');

  console.log('\n❌ Could not find venue matching:', VENUE_NAME);
  console.log('\nAvailable venues:');
  allVenues?.forEach(v => console.log(`  - ${v.name} (${v.id})`));
  console.log('\nUsage:');
  console.log('  node_modules/.bin/tsx scripts/bulk-import-invoices.ts "Venue Name"');
  console.log('  or set VENUE_ID=<id> in .env.local\n');

  throw new Error('Venue not found');
}

async function processInvoice(filePath: string, fileName: string, venueId: string) {
  console.log(`\n📄 Processing: ${fileName}`);

  try {
    // Read file
    const buffer = await readFile(filePath);
    const ext = extname(fileName).toLowerCase();

    // Determine file type from extension
    let mimeType: string;
    let isPDF = false;

    if (ext === '.pdf') {
      mimeType = 'application/pdf';
      isPDF = true;
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      mimeType = 'image/jpeg';
    } else if (ext === '.png') {
      mimeType = 'image/png';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    console.log(`  Type: ${mimeType}, Size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // Extract with OCR
    console.log('  🔍 Running OCR...');
    const { invoice: rawInvoice } = isPDF
      ? await extractInvoiceFromPDF(buffer)
      : await extractInvoiceWithClaude(buffer, mimeType);

    // Normalize
    console.log('  🔄 Normalizing data...');
    const normalized = await normalizeOCR(rawInvoice, supabase);

    console.log(`  📊 Found: ${normalized.vendorName || 'Unknown'}, Invoice #${normalized.invoiceNumber || 'N/A'}`);
    console.log(`  💰 Total: $${normalized.totalAmount?.toFixed(2) || '0.00'}`);
    console.log(`  📦 Lines: ${normalized.lines.length}`);

    // Upload to storage
    const fileName_clean = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `uploads/${Date.now()}-${fileName_clean}`;

    console.log('  ☁️  Uploading to storage...');
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('opsos-invoices')
      .upload(storagePath, buffer, {
        contentType: mimeType
      });

    if (uploadError) {
      console.error('  ❌ Storage upload failed:', uploadError);
    }

    const imageUrl = uploadData
      ? supabase.storage.from('opsos-invoices').getPublicUrl(uploadData.path).data.publicUrl
      : null;

    // Create invoice in database
    const invoicePayload = {
      venue_id: venueId,
      vendor_id: normalized.vendorId || null,
      invoice_number: normalized.invoiceNumber,
      invoice_date: normalized.invoiceDate,
      due_date: normalized.dueDate,
      total_amount: normalized.totalAmount,
      ocr_confidence: normalized.ocrConfidence,
      ocr_raw_json: rawInvoice,
      image_url: imageUrl,
      status: 'draft',
    };

    const linesPayload = normalized.lines.map((line) => ({
      item_id: line.itemId || null,
      description: line.description,
      quantity: line.qty,
      unit_cost: line.unitCost,
      ocr_confidence: line.ocrConfidence,
    }));

    console.log('  💾 Creating invoice in database...');
    const { data: invoiceId, error: rpcError } = await supabase.rpc(
      'create_invoice_with_lines',
      {
        invoice_data: invoicePayload,
        lines_data: linesPayload,
      }
    );

    if (rpcError) {
      throw rpcError;
    }

    console.log(`  ✅ Success! Invoice ID: ${invoiceId}`);

    if (normalized.warnings && normalized.warnings.length > 0) {
      console.log(`  ⚠️  Warnings:`);
      normalized.warnings.forEach(w => console.log(`     - ${w}`));
    }

    return { success: true, invoiceId, fileName };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null ? JSON.stringify(error) : 'Unknown error');

    // Check if it's a duplicate invoice error
    if (errorMsg.includes('invoices_vendor_invoice_unique') || errorMsg.includes('23505')) {
      console.warn(`  ⚠️  Skipped: Duplicate invoice (already exists)`);
      return { success: false, fileName, error: 'Duplicate invoice - already imported', skipped: true };
    }

    console.error(`  ❌ Failed: ${errorMsg}`);
    if (error instanceof Error && error.stack) {
      console.error(`  Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
    }
    return { success: false, fileName, error: errorMsg };
  }
}

async function main() {
  console.log('🚀 Bulk Invoice Import - Delilah Dallas\n');
  console.log(`📁 Reading from: ${INVOICE_DIR}\n`);

  // Get venue ID
  const venueId = await getVenueId();

  // Read directory
  const files = await readdir(INVOICE_DIR);
  const invoiceFiles = files.filter(f => {
    const ext = extname(f).toLowerCase();
    return ['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  });

  console.log(`Found ${invoiceFiles.length} invoice files\n`);
  console.log('=' .repeat(60));

  const results = [];

  // Process each file
  for (const fileName of invoiceFiles) {
    const filePath = join(INVOICE_DIR, fileName);
    const result = await processInvoice(filePath, fileName, venueId);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:\n');

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📋 Total: ${results.length}`);

  if (failCount > 0) {
    console.log('\nFailed files:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.fileName}: ${r.error}`);
    });
  }

  console.log('\n✨ Done!\n');
}

main().catch(console.error);
