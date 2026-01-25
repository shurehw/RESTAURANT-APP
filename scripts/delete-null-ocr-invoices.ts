/**
 * Delete invoices with null ocr_raw_json
 * These are old/test invoices from a bulk import that didn't store OCR data
 */

import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function deleteNullOcrInvoices() {
  const supabase = createAdminClient();

  console.log('\n🗑️  DELETING INVOICES WITH NULL OCR DATA\n');
  console.log('═'.repeat(80));

  // Get all invoices without OCR data
  const { data: invoices, count } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      created_at,
      vendors!inner(name)
    `, { count: 'exact' })
    .is('ocr_raw_json', null)
    .gt('total_amount', 0);

  console.log(`\nFound ${count} invoices with null ocr_raw_json\n`);

  if (!invoices || invoices.length === 0) {
    console.log('✅ No invoices to delete');
    return;
  }

  // Show summary by vendor
  const byVendor = invoices.reduce((acc: any, inv) => {
    const vendor = (inv.vendors as any)?.name || 'Unknown';
    if (!acc[vendor]) {
      acc[vendor] = { count: 0, total: 0 };
    }
    acc[vendor].count++;
    acc[vendor].total += inv.total_amount || 0;
    return acc;
  }, {});

  console.log('📦 INVOICES TO DELETE BY VENDOR:\n');
  Object.entries(byVendor)
    .sort(([, a]: any, [, b]: any) => b.count - a.count)
    .forEach(([vendor, stats]: [string, any]) => {
      console.log(`  ${vendor}: ${stats.count} invoices ($${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    });

  const totalValue = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  console.log(`\n💰 Total value: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`📊 Total count: ${invoices.length} invoices\n`);

  console.log('─'.repeat(80));
  console.log('\n🚨 WARNING: This will permanently delete these invoices!');
  console.log('These appear to be old test/sample data from a failed bulk import.\n');

  // Delete in batches
  const batchSize = 50;
  let deleted = 0;

  console.log('🔨 Starting deletion...\n');

  for (let i = 0; i < invoices.length; i += batchSize) {
    const batch = invoices.slice(i, i + batchSize);
    const batchIds = batch.map(inv => inv.id);

    const { error } = await supabase
      .from('invoices')
      .delete()
      .in('id', batchIds);

    if (error) {
      console.error(`  ❌ Error deleting batch ${Math.floor(i / batchSize) + 1}:`, error);
    } else {
      deleted += batch.length;
      console.log(`  ✅ Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} invoices (${deleted}/${invoices.length} total)`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n✅ DELETION COMPLETE!`);
  console.log(`\nDeleted: ${deleted} invoices`);
  console.log(`Value removed: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log('\n═'.repeat(80));
}

deleteNullOcrInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
