/**
 * Find EXACT duplicates (same vendor_id + invoice_number)
 * These are the ones blocking the unique constraint
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findExactDuplicates() {
  console.log('🔍 Finding EXACT duplicates (vendor_id + invoice_number)...\n');

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, vendor_id, invoice_number, invoice_date, total_amount, created_at, vendors(name)')
    .order('vendor_id')
    .order('invoice_number')
    .order('created_at');

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!invoices) {
    console.log('No invoices found');
    return;
  }

  console.log(`Analyzing ${invoices.length} invoices...\n`);

  const groups = new Map<string, typeof invoices>();

  for (const inv of invoices) {
    const key = `${inv.vendor_id}_${inv.invoice_number}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(inv);
  }

  let duplicateCount = 0;
  const deleteIds: string[] = [];

  for (const [key, group] of groups.entries()) {
    if (group.length > 1) {
      duplicateCount++;
      const vendor = (group[0].vendors as any)?.name || 'Unknown';
      console.log(`${duplicateCount}. ${vendor} - Invoice #${group[0].invoice_number} (${group.length} copies)`);

      group.forEach((inv, idx) => {
        const action = idx === 0 ? '✅ KEEP' : '❌ DELETE';
        console.log(`   ${action}: ${inv.invoice_date} - $${inv.total_amount} - ID: ${inv.id.substring(0, 8)}...`);
        if (idx > 0) {
          deleteIds.push(inv.id);
        }
      });
      console.log();
    }
  }

  if (duplicateCount === 0) {
    console.log('✅ No exact duplicates found! Constraint can be applied.');
  } else {
    console.log('═'.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Duplicate groups: ${duplicateCount}`);
    console.log(`   Invoices to delete: ${deleteIds.length}`);
    console.log(`\n⚠️  These duplicates are blocking the unique constraint!`);
    console.log(`\nTo delete them, run:`);
    console.log(`   node_modules/.bin/tsx scripts/delete-exact-duplicates.ts\n`);
  }
}

findExactDuplicates().catch(console.error);
