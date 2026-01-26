/**
 * Merge Duplicate Vendors
 * Keeps vendor with most invoices, reassigns invoices from duplicates
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Aggressive normalize for grouping
function aggressiveNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\b(inc|llc|corp|co|ltd|foods|food|company|enterprises|enterprise|distribution|dist|supply|supplies)\b/g, '')
    .trim();
}

// Better normalization for the canonical name
function betterNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'") // Normalize apostrophes
    .replace(/[""]/g, '"')  // Normalize quotes
    .replace(/\s+/g, ' ')   // Normalize whitespace
    .replace(/[^\w\s'-]/g, '') // Remove most punctuation except apostrophe and hyphen
    .trim();
}

interface VendorWithCount {
  id: string;
  name: string;
  normalized_name: string;
  is_active: boolean;
  created_at: string;
  invoiceCount: number;
}

async function getVendorInvoiceCount(vendorId: string): Promise<number> {
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId);
  return count || 0;
}

async function mergeVendors(keep: VendorWithCount, duplicates: VendorWithCount[]): Promise<void> {
  console.log(`\n  Keeping: "${keep.name}" (${keep.invoiceCount} invoices)`);
  
  for (const dup of duplicates) {
    console.log(`  Merging: "${dup.name}" (${dup.invoiceCount} invoices)`);
    
    // Reassign invoices
    if (dup.invoiceCount > 0) {
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ vendor_id: keep.id })
        .eq('vendor_id', dup.id);

      if (updateError) {
        console.error(`    ❌ Failed to reassign invoices: ${updateError.message}`);
        continue;
      }
      console.log(`    ✅ Reassigned ${dup.invoiceCount} invoices`);
    }

    // Also update vendor_item_aliases
    const { error: aliasError } = await supabase
      .from('vendor_item_aliases')
      .update({ vendor_id: keep.id })
      .eq('vendor_id', dup.id);

    if (aliasError && aliasError.code !== 'PGRST116') {
      console.log(`    ⚠️  Alias update: ${aliasError.message}`);
    }

    // Deactivate duplicate vendor
    const { error: deactivateError } = await supabase
      .from('vendors')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', dup.id);

    if (deactivateError) {
      console.error(`    ❌ Failed to deactivate: ${deactivateError.message}`);
    } else {
      console.log(`    ✅ Deactivated duplicate vendor`);
    }
  }

  // Update the keeper's normalized_name to use better normalization
  const newNormalized = betterNormalize(keep.name);
  await supabase
    .from('vendors')
    .update({ normalized_name: newNormalized })
    .eq('id', keep.id);
}

async function main() {
  console.log('🔄 Merging Duplicate Vendors\n');
  console.log('='.repeat(80));

  // Get all active vendors
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active, created_at')
    .eq('is_active', true)
    .order('name');

  if (error || !vendors) {
    console.error('Error fetching vendors:', error);
    return;
  }

  // Get invoice counts
  const vendorsWithCounts: VendorWithCount[] = [];
  for (const v of vendors) {
    const count = await getVendorInvoiceCount(v.id);
    vendorsWithCounts.push({ ...v, invoiceCount: count });
  }

  // Group by aggressive normalized name
  const groups = new Map<string, VendorWithCount[]>();
  for (const vendor of vendorsWithCounts) {
    const key = aggressiveNormalize(vendor.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(vendor);
  }

  // Find duplicate groups
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, vendors]) => vendors.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('\n✅ No duplicates found!');
    return;
  }

  console.log(`\n📦 Found ${duplicateGroups.length} duplicate groups to merge\n`);

  let totalMerged = 0;
  let totalInvoicesReassigned = 0;

  for (const [normalized, vendorGroup] of duplicateGroups) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Group: "${normalized}"`);
    
    // Sort by invoice count (descending) to keep the one with most invoices
    vendorGroup.sort((a, b) => b.invoiceCount - a.invoiceCount);
    
    const keep = vendorGroup[0];
    const duplicates = vendorGroup.slice(1);
    
    const invoicesToReassign = duplicates.reduce((sum, d) => sum + d.invoiceCount, 0);
    
    await mergeVendors(keep, duplicates);
    
    totalMerged += duplicates.length;
    totalInvoicesReassigned += invoicesToReassign;
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 MERGE COMPLETE\n');
  console.log(`  Vendors merged: ${totalMerged}`);
  console.log(`  Invoices reassigned: ${totalInvoicesReassigned}`);
  console.log(`  Remaining active vendors: ${vendors.length - totalMerged}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
