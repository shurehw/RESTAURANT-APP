#!/usr/bin/env node
/**
 * Merge duplicate vendors
 * Consolidates similar vendor names and updates all references
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

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

// Levenshtein distance for similarity
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
  for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

function similarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 1.0;
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

async function mergeVendors(keepId: string, mergeIds: string[]) {
  console.log(`\n  Merging ${mergeIds.length} vendor(s) into ${keepId}...`);

  // Update all invoices to point to the kept vendor
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({ vendor_id: keepId })
    .in('vendor_id', mergeIds);

  if (invoiceError) {
    console.error('    ❌ Error updating invoices:', invoiceError);
    return false;
  }

  // Update purchase orders
  const { error: poError } = await supabase
    .from('purchase_orders')
    .update({ vendor_id: keepId })
    .in('vendor_id', mergeIds);

  if (poError && poError.code !== '42P01') { // Ignore if table doesn't exist
    console.error('    ❌ Error updating purchase orders:', poError);
    return false;
  }

  // Update vendor item aliases
  const { error: aliasError } = await supabase
    .from('vendor_item_aliases')
    .update({ vendor_id: keepId })
    .in('vendor_id', mergeIds);

  if (aliasError && aliasError.code !== '42P01') {
    console.error('    ❌ Error updating vendor aliases:', aliasError);
    return false;
  }

  // Delete the duplicate vendors
  const { error: deleteError } = await supabase
    .from('vendors')
    .delete()
    .in('id', mergeIds);

  if (deleteError) {
    console.error('    ❌ Error deleting duplicate vendors:', deleteError);
    return false;
  }

  console.log(`    ✓ Merged successfully`);
  return true;
}

// Predefined merge rules for exact matches
const MERGE_RULES = [
  // Exact duplicates
  { keep: "Spec's Wine, Spirits & Finer Foods", normalize: "spec's wine, spirits & finer foods" },
  { keep: "Dairyland Produce, LLC (dba Hardie's Fresh Foods)", normalize: "dairyland produce, llc (dba hardie's fresh foods)" },

  // Chef's Warehouse variations -> standardize on "The Chefs' Warehouse"
  { keep: "The Chefs' Warehouse", normalize: "the chefs' warehouse" },
  { keep: "The Chefs' Warehouse", normalize: "the chefs warehouse" },
  { keep: "The Chefs' Warehouse", normalize: "chefs' warehouse" },
  { keep: "The Chefs' Warehouse", normalize: "chefs warehouse" },
  { keep: "The Chefs' Warehouse", normalize: "chefswarehouse" },
  { keep: "The Chefs' Warehouse", normalize: "the chefswarehouse" },

  // Chef's Warehouse Midwest variations
  { keep: "The Chefs' Warehouse Midwest LLC", normalize: "the chefs' warehouse midwest llc" },
  { keep: "The Chefs' Warehouse Midwest LLC", normalize: "chefs warehouse midwest llc" },
  { keep: "The Chefs' Warehouse Midwest LLC", normalize: "the chefswarehouse midwest llc" },

  // RNDC variations -> standardize on full name
  { keep: "Republic National Distributing Company", normalize: "republic national distributing company" },
  { keep: "Republic National Distributing Company", normalize: "republic national distributing company (rndc)" },
  { keep: "Republic National Distributing Company", normalize: "rndc - republic national distributing company" },
  { keep: "Republic National Distributing Company", normalize: "rndc (republic national distributing company)" },

  // Oak Farms variations
  { keep: "OAK FARMS-DALLAS DFA DAIRY BRANDS", normalize: "oak farms-dallas dfa dairy brands" },
  { keep: "OAK FARMS-DALLAS DFA DAIRY BRANDS", normalize: "oak farms-dallas dfr dairy brands" },
  { keep: "OAK FARMS-DALLAS DFA DAIRY BRANDS", normalize: "gaf farms-dallas dfa dairy brands" },

  // MFW variations
  { keep: "MFW - Maekor Fine Wine", normalize: "mfw - maekor fine wine" },
  { keep: "MFW - Maekor Fine Wine", normalize: "mfw - maesor fine wine" },
  { keep: "MFW - Maekor Fine Wine", normalize: "mfw - maxxor fine wine" },
];

async function mergeDuplicateVendors() {
  console.log('\n=== Merging Duplicate Vendors ===\n');

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`Found ${vendors?.length || 0} active vendors\n`);

  // Group vendors by merge rules
  const mergeGroups = new Map<string, string[]>();

  for (const rule of MERGE_RULES) {
    const keepVendor = vendors?.find(v => v.normalized_name === rule.normalize);
    if (keepVendor && !mergeGroups.has(rule.keep)) {
      mergeGroups.set(rule.keep, []);
    }

    const matchingVendors = vendors?.filter(v => v.normalized_name === rule.normalize) || [];
    for (const vendor of matchingVendors) {
      if (mergeGroups.has(rule.keep)) {
        mergeGroups.get(rule.keep)!.push(vendor.id);
      }
    }
  }

  // Execute merges
  let merged = 0;
  for (const [keepName, vendorIds] of mergeGroups) {
    if (vendorIds.length <= 1) continue; // Skip if only one vendor

    const keepVendor = vendors?.find(v => vendorIds.includes(v.id) && v.name === keepName);
    if (!keepVendor) {
      // Use first vendor as the one to keep
      const firstVendor = vendors?.find(v => v.id === vendorIds[0]);
      if (!firstVendor) continue;

      console.log(`\nMerging into: "${firstVendor.name}"`);
      console.log(`  Merging ${vendorIds.length - 1} duplicate(s)`);

      const mergeIds = vendorIds.filter(id => id !== firstVendor.id);
      if (await mergeVendors(firstVendor.id, mergeIds)) {
        merged += mergeIds.length;
      }
    } else {
      console.log(`\nMerging into: "${keepName}"`);
      console.log(`  Merging ${vendorIds.length - 1} duplicate(s)`);

      const mergeIds = vendorIds.filter(id => id !== keepVendor.id);
      if (await mergeVendors(keepVendor.id, mergeIds)) {
        merged += mergeIds.length;
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Merged ${merged} duplicate vendors`);
  console.log(`\nRun the find-similar-vendors script again to check for remaining duplicates.`);
}

mergeDuplicateVendors().catch(console.error);
