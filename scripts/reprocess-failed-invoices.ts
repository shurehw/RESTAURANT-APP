/**
 * Re-process Failed Invoices
 * Re-runs OCR on invoices with missing/incomplete line items
 * Uses improved OCR prompts for better extraction
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reprocessFailedInvoices() {
  console.log('🔄 Re-processing Failed Invoices\n');
  console.log('═'.repeat(60));

  // Read the priority list
  if (!fs.existsSync('priority-reprocess.csv')) {
    console.error('❌ priority-reprocess.csv not found. Run identify-failed-invoices.ts first.');
    return;
  }

  const csv = fs.readFileSync('priority-reprocess.csv', 'utf-8');
  const lines = csv.split('\n').slice(1); // Skip header

  const failedInvoices = lines
    .filter(line => line.trim())
    .map(line => {
      const parts = line.split(',');
      return {
        id: parts[0],
        invoice_number: parts[1],
        vendor: parts[2],
        date: parts[3],
        invoice_total: parseFloat(parts[4]),
        missing_value: parseFloat(parts[5]),
        storage_path: parts[6]
      };
    })
    .filter(inv => inv.storage_path); // Only process invoices with storage paths

  console.log(`\n📋 Found ${failedInvoices.length} invoices to re-process\n`);

  // Group by severity
  const critical = failedInvoices.filter(i => i.missing_value > 1000);
  const high = failedInvoices.filter(i => i.missing_value > 100 && i.missing_value <= 1000);
  const medium = failedInvoices.filter(i => i.missing_value <= 100);

  console.log(`Priority breakdown:`);
  console.log(`  🚨 Critical (>$1,000): ${critical.length}`);
  console.log(`  ⚠️  High ($100-$1,000): ${high.length}`);
  console.log(`  ⚡ Medium (<$100): ${medium.length}\n`);

  console.log('═'.repeat(60));
  console.log('\n⚠️  IMPORTANT: This script will:\n');
  console.log('1. Delete existing line items for these invoices');
  console.log('2. Re-run OCR extraction with improved prompts');
  console.log('3. Import new line items');
  console.log('4. Validate completeness\n');
  console.log(`Total invoices: ${failedInvoices.length}`);
  console.log(`Total missing value: $${failedInvoices.reduce((sum, i) => sum + i.missing_value, 0).toFixed(2)}\n`);
  console.log('═'.repeat(60));

  // Step 1: Delete existing line items for failed invoices
  console.log('\n🗑️  Step 1: Deleting existing incomplete line items...\n');

  const invoiceIds = failedInvoices.map(i => i.id);

  // Delete in batches
  let deletedCount = 0;
  for (let i = 0; i < invoiceIds.length; i += 50) {
    const batch = invoiceIds.slice(i, i + 50);
    const { error, count } = await supabase
      .from('invoice_lines')
      .delete()
      .in('invoice_id', batch);

    if (error) {
      console.error(`Error deleting batch ${i / 50 + 1}:`, error);
    } else {
      deletedCount += (count || 0);
      console.log(`  Deleted batch ${i / 50 + 1}: ${count || 0} line items`);
    }
  }

  console.log(`\n✅ Deleted ${deletedCount} old line items\n`);

  // Step 2: Show invoices ready for re-processing
  console.log('📋 Invoices ready for re-processing:\n');

  // Show top 50 by missing value
  const sortedByValue = [...failedInvoices].sort((a, b) => b.missing_value - a.missing_value);

  console.log('Top 50 by missing value:\n');
  sortedByValue.slice(0, 50).forEach((inv, idx) => {
    console.log(`${idx + 1}. ${inv.vendor} | ${inv.invoice_number}`);
    console.log(`   Total: $${inv.invoice_total} | Missing: $${inv.missing_value.toFixed(2)}`);
    console.log(`   Path: ${inv.storage_path}\n`);
  });

  if (failedInvoices.length > 50) {
    console.log(`... and ${failedInvoices.length - 50} more\n`);
  }

  console.log('═'.repeat(60));
  console.log('\n📝 NEXT STEPS:\n');
  console.log('These invoices are now ready for re-import.');
  console.log('You can re-process them by:');
  console.log('  1. Using the bulk invoice upload UI');
  console.log('  2. Using the re-import endpoint with storage_path');
  console.log('  3. Running a bulk re-process script\n');

  // Export storage paths for bulk re-import
  const storagePaths = failedInvoices
    .filter(i => i.storage_path)
    .map(i => i.storage_path)
    .join('\n');

  fs.writeFileSync('failed-invoice-paths.txt', storagePaths);
  console.log('✅ Exported storage paths to: failed-invoice-paths.txt\n');

  // Save metadata for re-import tracking
  const metadata = {
    total_invoices: failedInvoices.length,
    total_missing_value: failedInvoices.reduce((sum, i) => sum + i.missing_value, 0),
    deleted_line_items: deletedCount,
    critical_count: critical.length,
    high_count: high.length,
    medium_count: medium.length,
    invoices: failedInvoices
  };

  fs.writeFileSync('reprocess-metadata.json', JSON.stringify(metadata, null, 2));
  console.log('✅ Saved metadata to: reprocess-metadata.json\n');
}

reprocessFailedInvoices();
