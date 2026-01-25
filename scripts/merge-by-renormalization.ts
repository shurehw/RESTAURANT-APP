#!/usr/bin/env node
/**
 * Merge vendors that normalize to the same value
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { normalizeVendorName } from '../lib/ocr/normalize';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function mergeVendors(keepId: string, mergeIds: string[]) {
  console.log(`\n  Merging ${mergeIds.length} vendor(s) into ${keepId}...`);

  // Update all invoices
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({ vendor_id: keepId })
    .in('vendor_id', mergeIds);

  if (invoiceError) {
    console.error('    ❌ Error updating invoices:', invoiceError);
    return false;
  }

  // Update purchase orders
  await supabase
    .from('purchase_orders')
    .update({ vendor_id: keepId })
    .in('vendor_id', mergeIds);

  // Update vendor item aliases
  await supabase
    .from('vendor_item_aliases')
    .update({ vendor_id: keepId })
    .in('vendor_id', mergeIds);

  // Delete duplicates
  const { error: deleteError } = await supabase
    .from('vendors')
    .delete()
    .in('id', mergeIds);

  if (deleteError) {
    console.error('    ❌ Error deleting duplicates:', deleteError);
    return false;
  }

  console.log(`    ✓ Merged successfully`);
  return true;
}

async function mergeByRenormalization() {
  console.log('\n=== Merging Vendors by Re-normalization ===\n');

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, organization_id, is_active, created_at')
    .eq('is_active', true)
    .order('created_at'); // Keep oldest

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Group by organization + new normalized name
  const groups = new Map<string, typeof vendors>();

  for (const vendor of vendors || []) {
    const newNormalized = normalizeVendorName(vendor.name);
    const key = `${vendor.organization_id}::${newNormalized}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(vendor);
  }

  // Find duplicates
  const duplicates = Array.from(groups.values()).filter(g => g.length > 1);

  console.log(`Found ${duplicates.length} groups of duplicates\n`);

  let merged = 0;

  for (const group of duplicates) {
    // Keep the oldest one (first in sorted array)
    const keep = group[0];
    const mergeList = group.slice(1);

    console.log(`\nMerging into: "${keep.name}" (created ${new Date(keep.created_at).toLocaleDateString()})`);
    mergeList.forEach(v => {
      console.log(`  - "${v.name}" (created ${new Date(v.created_at).toLocaleDateString()})`);
    });

    if (await mergeVendors(keep.id, mergeList.map(v => v.id))) {
      merged += mergeList.length;

      // Update the kept vendor's normalized_name
      const newNormalized = normalizeVendorName(keep.name);
      await supabase
        .from('vendors')
        .update({ normalized_name: newNormalized })
        .eq('id', keep.id);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Merged ${merged} duplicate vendors`);
}

mergeByRenormalization().catch(console.error);
