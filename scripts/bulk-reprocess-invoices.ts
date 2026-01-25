/**
 * Bulk Re-process Failed Invoices
 * Re-runs OCR on all failed invoices using storage paths
 * Processes invoices in batches with rate limiting
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 5; // Process 5 at a time
const DELAY_MS = 5000; // 5 seconds between batches

interface InvoiceToReprocess {
  id: string;
  invoice_number: string;
  vendor: string;
  invoice_total: number;
  missing_value: number;
  storage_path: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function reprocessInvoice(invoice: InvoiceToReprocess): Promise<{success: boolean; error?: string}> {
  try {
    console.log(`  Processing: ${invoice.vendor} | ${invoice.invoice_number}`);
    console.log(`    Missing: $${invoice.missing_value.toFixed(2)}`);

    // Step 1: Delete existing line items
    const { error: deleteError } = await supabase
      .from('invoice_lines')
      .delete()
      .eq('invoice_id', invoice.id);

    if (deleteError) {
      console.log(`    ❌ Error deleting old lines: ${deleteError.message}`);
      return { success: false, error: `Delete error: ${deleteError.message}` };
    }

    console.log(`    ✓ Deleted old line items`);

    // Step 2: Download PDF from storage
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('invoices')
      .download(invoice.storage_path);

    if (downloadError || !pdfData) {
      console.log(`    ❌ Error downloading PDF: ${downloadError?.message}`);
      return { success: false, error: `Download error: ${downloadError?.message}` };
    }

    console.log(`    ✓ Downloaded PDF (${(pdfData.size / 1024).toFixed(1)}KB)`);

    // Step 3: Re-run OCR via API
    const formData = new FormData();
    formData.append('pdf', pdfData, 'invoice.pdf');
    formData.append('invoice_id', invoice.id);
    formData.append('re_process', 'true');

    const response = await fetch('http://localhost:3000/api/invoices/ocr', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`    ❌ OCR failed: ${response.status} - ${errorText}`);
      return { success: false, error: `OCR error: ${response.status}` };
    }

    const result = await response.json();
    console.log(`    ✅ OCR complete: ${result.lineItems?.length || 0} line items extracted`);

    return { success: true };

  } catch (error) {
    console.log(`    ❌ Unexpected error: ${error instanceof Error ? error.message : 'Unknown'}`);
    return { success: false, error: `Unexpected: ${error}` };
  }
}

async function bulkReprocess() {
  console.log('🔄 Bulk Re-processing Failed Invoices\n');
  console.log('═'.repeat(60));

  // Load metadata
  if (!fs.existsSync('reprocess-metadata.json')) {
    console.error('❌ reprocess-metadata.json not found. Run reprocess-failed-invoices.ts first.');
    return;
  }

  const metadata = JSON.parse(fs.readFileSync('reprocess-metadata.json', 'utf-8'));
  const invoices: InvoiceToReprocess[] = metadata.invoices;

  console.log(`\n📋 Loading ${invoices.length} invoices for re-processing\n`);
  console.log(`Total missing value: $${metadata.total_missing_value.toFixed(2)}`);
  console.log(`Priority breakdown:`);
  console.log(`  🚨 Critical: ${metadata.critical_count}`);
  console.log(`  ⚠️  High: ${metadata.high_count}`);
  console.log(`  ⚡ Medium: ${metadata.medium_count}\n`);

  // Sort by missing value (process highest value first)
  const sorted = [...invoices].sort((a, b) => b.missing_value - a.missing_value);

  const results = {
    total: sorted.length,
    success: 0,
    failed: 0,
    errors: [] as Array<{invoice: string; error: string}>
  };

  console.log('═'.repeat(60));
  console.log(`\n🚀 Starting bulk re-process (${BATCH_SIZE} at a time, ${DELAY_MS/1000}s delay)\n`);

  // Process in batches
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const batch = sorted.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sorted.length / BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (invoices ${i + 1}-${Math.min(i + BATCH_SIZE, sorted.length)}):\n`);

    // Process batch in parallel
    const promises = batch.map(inv => reprocessInvoice(inv));
    const batchResults = await Promise.all(promises);

    // Tally results
    batchResults.forEach((result, idx) => {
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push({
          invoice: `${batch[idx].vendor} | ${batch[idx].invoice_number}`,
          error: result.error || 'Unknown error'
        });
      }
    });

    console.log(`\n  Batch complete: ${batchResults.filter(r => r.success).length}/${batch.length} successful`);
    console.log(`  Overall: ${results.success}/${results.total} complete (${(results.success/results.total*100).toFixed(1)}%)\n`);

    // Delay before next batch (except on last batch)
    if (i + BATCH_SIZE < sorted.length) {
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
    console.log('⚠️  FAILED INVOICES:\n');
    results.errors.forEach((err, idx) => {
      console.log(`${idx + 1}. ${err.invoice}`);
      console.log(`   Error: ${err.error}\n`);
    });
  }

  // Save results
  fs.writeFileSync('reprocess-results.json', JSON.stringify(results, null, 2));
  console.log('✅ Results saved to: reprocess-results.json\n');
}

bulkReprocess();
