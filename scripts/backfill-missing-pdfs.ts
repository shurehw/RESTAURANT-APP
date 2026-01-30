import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { extractInvoiceFromPDF } from '../lib/ocr/claude';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const INVOICE_DIR = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans';

async function getAllPDFs(dir: string): Promise<string[]> {
  const pdfs: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      pdfs.push(...await getAllPDFs(fullPath));
    } else if (item.isFile() && item.name.toLowerCase().endsWith('.pdf')) {
      pdfs.push(fullPath);
    }
  }

  return pdfs;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limit = process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1];
  const maxFiles = limit ? parseInt(limit) : undefined;

  console.log(`🔍 Backfilling missing invoice PDFs from: ${INVOICE_DIR}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE'}`);
  if (maxFiles) console.log(`   Limit: Processing first ${maxFiles} PDFs`);
  console.log();

  // Get all invoices without storage_path
  const { data: invoicesWithoutPDF } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_id, vendor:vendors(name)')
    .is('storage_path', null)
    .order('created_at', { ascending: false });

  console.log(`Found ${invoicesWithoutPDF?.length || 0} invoices without PDFs\n`);

  // Get all PDF files
  console.log('Scanning for PDF files...');
  const pdfFiles = await getAllPDFs(INVOICE_DIR);
  const filesToProcess = maxFiles ? pdfFiles.slice(0, maxFiles) : pdfFiles;
  console.log(`Found ${pdfFiles.length} PDF files (processing ${filesToProcess.length})\n`);

  let matched = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < filesToProcess.length; i++) {
    const pdfPath = filesToProcess[i];
    const fileName = path.basename(pdfPath);

    console.log(`\n[${i + 1}/${filesToProcess.length}] Processing: ${fileName}`);

    try {
      // Read PDF
      const buffer = fs.readFileSync(pdfPath);

      // Extract invoice number using OCR
      console.log('   📄 Extracting invoice number...');
      const ocrResult = await extractInvoiceFromPDF(buffer);
      const invoices = ocrResult.invoices || [ocrResult.invoice!];

      if (invoices.length === 0 || !invoices[0]) {
        console.log('   ⚠️  Could not extract invoice data');
        skipped++;
        continue;
      }

      const invoiceNumber = invoices[0].invoiceNumber;
      const vendor = invoices[0].vendor;

      if (!invoiceNumber) {
        console.log('   ⚠️  No invoice number found');
        skipped++;
        continue;
      }

      console.log(`   📋 Invoice Number: ${invoiceNumber} | Vendor: ${vendor}`);

      // Find matching invoice in DB
      const matchingInvoice = invoicesWithoutPDF?.find(inv =>
        inv.invoice_number === invoiceNumber
      );

      if (!matchingInvoice) {
        console.log('   ⏭️  No matching invoice in DB (or already has PDF)');
        skipped++;
        continue;
      }

      console.log(`   ✅ Found matching invoice: ${matchingInvoice.id}`);

      if (dryRun) {
        console.log('   🔍 DRY RUN - Would upload PDF and update storage_path');
        matched++;
        continue;
      }

      // Upload PDF to storage
      const storagePath = `raw/${Date.now()}-${fileName}`;
      console.log(`   📤 Uploading to: ${storagePath}`);

      const { error: uploadError } = await supabase.storage
        .from('opsos-invoices')
        .upload(storagePath, buffer, { contentType: 'application/pdf' });

      if (uploadError) {
        console.log(`   ❌ Upload failed: ${uploadError.message}`);
        failed++;
        continue;
      }

      // Update invoice with storage_path
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ storage_path: storagePath })
        .eq('id', matchingInvoice.id);

      if (updateError) {
        console.log(`   ❌ Update failed: ${updateError.message}`);
        failed++;
        continue;
      }

      console.log('   ✅ PDF uploaded and linked to invoice');
      matched++;

    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Complete! Matched: ${matched} | Failed: ${failed} | Skipped: ${skipped}`);
  console.log(`\nTo apply changes, run without --dry-run flag`);
}

main().catch(console.error);
