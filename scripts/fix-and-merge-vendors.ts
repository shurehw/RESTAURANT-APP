/**
 * Fix OCR errors and merge duplicate vendors
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MergeRule {
  keep: string;           // Vendor name to keep
  merge: string[];        // Vendor names to merge into keep
  reason: string;
}

const MERGE_RULES: MergeRule[] = [
  // MARKON variations (OCR errors)
  {
    keep: 'MARKON',
    merge: ['MARION', 'MARKOL', 'MARDOM', 'MARMON', 'MARONI', 'MARQAL', 'Maroon', 'Marvin', 'Mariani'],
    reason: 'OCR variations of MARKON'
  },

  // Chefs Warehouse consolidation
  {
    keep: 'The Chefs Warehouse',
    merge: ['Chefs Warehouse Midwest LLC', 'The Chefs\' Warehouse of Florida, LLC'],
    reason: 'Same company, different divisions'
  },

  // SYSCO consolidation
  {
    keep: 'SYSCO',
    merge: ['SYSCO North Texas', 'SYSCO NORTH TEXAS FOODSERVICE', 'Sysco San Diego, Inc.'],
    reason: 'Same company, different regions'
  },

  // Texas Steakhouse variations
  {
    keep: 'Texas Roadhouse Steaks',
    merge: ['Texas Steakhouse', 'Texas Steakhouse Steaks', 'TEXAS THE GREAT STEAKHOUSE STEAKS'],
    reason: 'OCR variations of same vendor'
  },

  // Dairyland consolidation
  {
    keep: 'Dairyland Produce, LLC (dba Hardie\'s Fresh Foods)',
    merge: ['Dairyland Produce, LLC'],
    reason: 'Same company, DBA clarification'
  },

  // Johnson Brothers consolidation
  {
    keep: 'Johnson Brothers of Texas',
    merge: ['Johnson Brothers Maverick of Texas'],
    reason: 'Same company'
  },

  // "BILL TO" / "BTI" are not vendors - these are invoice artifacts
  {
    keep: 'UNKNOWN',
    merge: ['BILL TO Customer', 'BTI To Customer', 'Bill Troishner'],
    reason: 'Invoice artifacts, not real vendors'
  }
];

async function mergeVendors() {
  console.log('🔧 Fixing and merging vendors...\n');

  let totalMerged = 0;

  for (const rule of MERGE_RULES) {
    console.log(`📋 ${rule.reason}`);
    console.log(`   Keep: "${rule.keep}"`);
    console.log(`   Merge: ${rule.merge.join(', ')}`);

    // Find the vendor to keep
    const { data: keepVendor } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('name', rule.keep)
      .maybeSingle();

    if (!keepVendor) {
      console.log(`   ⚠️  Vendor "${rule.keep}" not found, skipping`);
      console.log();
      continue;
    }

    // Find vendors to merge
    const { data: mergeVendors } = await supabase
      .from('vendors')
      .select('id, name')
      .in('name', rule.merge);

    if (!mergeVendors || mergeVendors.length === 0) {
      console.log(`   ℹ️  No vendors found to merge`);
      console.log();
      continue;
    }

    console.log(`   Found ${mergeVendors.length} vendor(s) to merge`);

    const mergeIds = mergeVendors.map(v => v.id);

    // Update invoices
    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({ vendor_id: keepVendor.id })
      .in('vendor_id', mergeIds);

    if (invoiceError) {
      console.error(`   ❌ Failed to update invoices:`, invoiceError.message);
      continue;
    }

    // Update vendor aliases
    const { error: aliasError } = await supabase
      .from('vendor_item_aliases')
      .update({ vendor_id: keepVendor.id })
      .in('vendor_id', mergeIds);

    if (aliasError && !aliasError.message.includes('0 rows')) {
      console.error(`   ⚠️  Failed to update aliases:`, aliasError.message);
    }

    // Delete merged vendors
    const { error: deleteError } = await supabase
      .from('vendors')
      .delete()
      .in('id', mergeIds);

    if (deleteError) {
      console.error(`   ❌ Failed to delete vendors:`, deleteError.message);
      continue;
    }

    console.log(`   ✅ Merged ${mergeVendors.length} vendor(s) into "${rule.keep}"`);
    console.log();
    totalMerged += mergeVendors.length;
  }

  console.log('═'.repeat(80));
  console.log(`\n✨ Total vendors merged: ${totalMerged}\n`);
}

async function fixDelilahData() {
  console.log('🔧 Fixing "Delilah Data LLC" vendor...\n');

  const { data: delilahData } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Delilah Data%')
    .maybeSingle();

  if (!delilahData) {
    console.log('✅ No "Delilah Data LLC" vendor found\n');
    return;
  }

  // Check what invoices use this vendor
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, storage_path')
    .eq('vendor_id', delilahData.id);

  if (!invoices || invoices.length === 0) {
    console.log('No invoices, deleting vendor...');
    await supabase.from('vendors').delete().eq('id', delilahData.id);
    console.log('✅ Deleted\n');
    return;
  }

  console.log(`Found ${invoices.length} invoice(s) with "Delilah Data LLC":`);
  invoices.forEach(inv => {
    console.log(`  - ${inv.invoice_number} (${inv.invoice_date})`);
    console.log(`    ${inv.storage_path}`);
  });

  console.log(`\n⚠️  These need manual review to determine correct vendor.\n`);
}

async function main() {
  await mergeVendors();
  await fixDelilahData();

  console.log('═'.repeat(80));
  console.log('\n✅ Vendor cleanup complete!\n');
}

main().catch(console.error);
