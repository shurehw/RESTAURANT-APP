/**
 * Direct Upload Food Invoices
 * Uploads PDFs from Multiple Food Split folder directly via API
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FOLDER_PATH = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food Split';
const VENUE_NAME = 'Delilah Dallas';
const BATCH_SIZE = 3; // Process 3 at a time
const DELAY_MS = 3000; // 3 seconds between batches

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadInvoice(filePath: string, fileName: string, venueId: string): Promise<{success: boolean; error?: string}> {
  try {
    console.log(`  📄 ${fileName}`);

    // Read PDF file
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });

    // Create form data using built-in FormData
    const formData = new FormData();
    formData.append('pdf', blob, fileName);
    formData.append('venue_id', venueId);

    // Upload via API
    const response = await fetch('http://localhost:3000/api/invoices/ocr', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`     ❌ Upload failed: ${response.status}`);
      return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
    }

    const result = await response.json();
    console.log(`     ✅ Imported: ${result.lineItems?.length || 0} line items`);

    return { success: true };

  } catch (error) {
    console.log(`     ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return { success: false, error: String(error) };
  }
}

async function uploadAll() {
  console.log('📤 Uploading Food Invoices from Multiple Food Split\n');
  console.log('═'.repeat(60));

  // Get venue ID
  const { data: venue } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', `%${VENUE_NAME}%`)
    .single();

  if (!venue) {
    console.error(`❌ Venue not found: ${VENUE_NAME}`);
    return;
  }

  console.log(`\n🏢 Venue: ${venue.name} (${venue.id})\n`);

  // Get all PDFs from folder
  if (!fs.existsSync(FOLDER_PATH)) {
    console.error(`❌ Folder not found: ${FOLDER_PATH}`);
    return;
  }

  const files = fs.readdirSync(FOLDER_PATH)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => ({
      name: f,
      path: path.join(FOLDER_PATH, f)
    }));

  console.log(`📁 Found ${files.length} PDF files\n`);
  console.log('═'.repeat(60));

  const results = {
    total: files.length,
    success: 0,
    failed: 0,
    errors: [] as Array<{file: string; error: string}>
  };

  console.log(`\n🚀 Starting upload (${BATCH_SIZE} at a time, ${DELAY_MS/1000}s delay)\n`);

  // Process in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(files.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (files ${i + 1}-${Math.min(i + BATCH_SIZE, files.length)}):\n`);

    // Process batch in parallel
    const promises = batch.map(file => uploadInvoice(file.path, file.name, venue.id));
    const batchResults = await Promise.all(promises);

    // Tally results
    batchResults.forEach((result, idx) => {
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({
          file: batch[idx].name,
          error: result.error || 'Unknown error'
        });
      }
    });

    console.log(`\n  Batch complete: ${batchResults.filter(r => r.success).length}/${batch.length} successful`);
    console.log(`  Overall: ${results.success}/${results.total} complete (${(results.success/results.total*100).toFixed(1)}%)\n`);

    // Delay before next batch (except on last batch)
    if (i + BATCH_SIZE < files.length) {
      console.log(`  ⏳ Waiting ${DELAY_MS/1000}s before next batch...`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 FINAL RESULTS:\n');
  console.log(`Total processed: ${results.total}`);
  console.log(`✅ Successful: ${results.success} (${(results.success/results.total*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${results.failed} (${(results.failed/results.total*100).toFixed(1)}%)\n`);

  if (results.errors.length > 0) {
    console.log('⚠️  FAILED FILES:\n');
    results.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err.file}`);
      console.log(`   Error: ${err.error}\n`);
    });
  }

  // Save results
  fs.writeFileSync('food-upload-results.json', JSON.stringify(results, null, 2));
  console.log('✅ Results saved to: food-upload-results.json\n');
}

uploadAll();
