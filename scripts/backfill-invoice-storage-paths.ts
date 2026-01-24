import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function backfillStoragePaths() {
  console.log('=== Backfill Invoice Storage Paths ===\n');

  // Step 1: List all files in both raw and uploads folders
  console.log('Step 1: Checking storage bucket...');

  const [rawResult, uploadsResult] = await Promise.all([
    supabase.storage.from('opsos-invoices').list('raw', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' }
    }),
    supabase.storage.from('opsos-invoices').list('uploads', {
      limit: 1000,
      sortBy: { column: 'created_at', order: 'desc' }
    })
  ]);

  const rawFiles = rawResult.data?.map(f => ({ ...f, folder: 'raw' })) || [];
  const uploadFiles = uploadsResult.data?.map(f => ({ ...f, folder: 'uploads' })) || [];
  const files = [...rawFiles, ...uploadFiles];

  console.log(`Found ${rawFiles.length} files in raw/`);
  console.log(`Found ${uploadFiles.length} files in uploads/`);
  console.log(`Total: ${files.length} files\n`);

  if (files.length === 0) {
    console.log('No files found in storage bucket. Nothing to backfill.');
    return;
  }

  // Step 2: Get all invoices without storage_path
  console.log('Step 2: Finding invoices without storage_path...');
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, vendor:vendors(name), created_at')
    .is('storage_path', null)
    .order('created_at', { ascending: false });

  if (invoicesError) {
    console.error('Error fetching invoices:', invoicesError);
    return;
  }

  console.log(`Found ${invoices?.length || 0} invoices without storage_path\n`);

  if (!invoices || invoices.length === 0) {
    console.log('All invoices already have storage paths!');
    return;
  }

  // Step 3: Try to match files to invoices
  console.log('Step 3: Attempting to match files to invoices...\n');

  let matchedCount = 0;
  let updatedCount = 0;

  for (const invoice of invoices) {
    // Try to find a matching file based on timing or invoice number
    const invoiceDate = new Date(invoice.created_at);
    const invoiceNumber = invoice.invoice_number?.replace(/[^a-zA-Z0-9]/g, '') || '';

    // Look for files created around the same time (within 1 hour)
    const matchingFile = files.find(file => {
      const fileName = file.name.toLowerCase();

      // Check if invoice number is in filename
      if (invoiceNumber && fileName.includes(invoiceNumber.toLowerCase())) {
        return true;
      }

      // Check if file was created around the same time
      const fileDate = new Date(file.created_at);
      const timeDiff = Math.abs(fileDate.getTime() - invoiceDate.getTime());
      const oneHour = 60 * 60 * 1000;

      return timeDiff < oneHour;
    });

    if (matchingFile) {
      const storagePath = `${matchingFile.folder}/${matchingFile.name}`;
      console.log(`Match found for invoice ${invoice.invoice_number || invoice.id}:`);
      console.log(`  File: ${matchingFile.name}`);
      console.log(`  Path: ${storagePath}`);

      // Update the invoice
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ storage_path: storagePath })
        .eq('id', invoice.id);

      if (updateError) {
        console.error(`  ❌ Error updating: ${updateError.message}`);
      } else {
        console.log(`  ✅ Updated successfully\n`);
        updatedCount++;
      }

      matchedCount++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Files in storage: ${files.length}`);
  console.log(`Invoices without paths: ${invoices.length}`);
  console.log(`Matches found: ${matchedCount}`);
  console.log(`Successfully updated: ${updatedCount}`);
  console.log(`Unmatched invoices: ${invoices.length - matchedCount}`);
}

backfillStoragePaths();
