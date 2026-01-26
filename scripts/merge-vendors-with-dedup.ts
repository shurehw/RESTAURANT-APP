/**
 * Merge Duplicate Vendors with Invoice Deduplication
 * Handles case where same invoice was imported under both vendor variants
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function aggressiveNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\b(inc|llc|corp|co|ltd|foods|food|company|enterprises|enterprise|distribution|dist|supply|supplies)\b/g, '')
    .trim();
}

function betterNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/[""„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[,\.()]/g, '')
    .replace(/\s+/g, ' ')
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

async function mergeVendorWithDedup(keep: VendorWithCount, dup: VendorWithCount): Promise<{ merged: boolean; invoicesReassigned: number; invoicesDeleted: number }> {
  let invoicesReassigned = 0;
  let invoicesDeleted = 0;

  // Get all invoices from the duplicate vendor
  const { data: dupInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, created_at')
    .eq('vendor_id', dup.id);

  if (!dupInvoices || dupInvoices.length === 0) {
    // No invoices, just deactivate
    await supabase
      .from('vendors')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', dup.id);
    return { merged: true, invoicesReassigned: 0, invoicesDeleted: 0 };
  }

  // Get invoice numbers from the keep vendor
  const { data: keepInvoices } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('vendor_id', keep.id);

  const keepInvoiceNumbers = new Set(keepInvoices?.map(i => i.invoice_number) || []);

  // Process each duplicate invoice
  for (const inv of dupInvoices) {
    if (keepInvoiceNumbers.has(inv.invoice_number)) {
      // This is a true duplicate - delete it (keep the one under the "keep" vendor)
      console.log(`    🗑️  Deleting duplicate invoice ${inv.invoice_number}`);
      
      // First delete invoice lines
      await supabase
        .from('invoice_lines')
        .delete()
        .eq('invoice_id', inv.id);
      
      // Then delete the invoice
      const { error: delError } = await supabase
        .from('invoices')
        .delete()
        .eq('id', inv.id);
      
      if (delError) {
        console.log(`    ❌ Failed to delete invoice: ${delError.message}`);
      } else {
        invoicesDeleted++;
      }
    } else {
      // Not a duplicate, reassign to keep vendor
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ vendor_id: keep.id })
        .eq('id', inv.id);

      if (updateError) {
        console.log(`    ❌ Failed to reassign invoice ${inv.invoice_number}: ${updateError.message}`);
      } else {
        invoicesReassigned++;
      }
    }
  }

  // Update vendor_item_aliases
  await supabase
    .from('vendor_item_aliases')
    .update({ vendor_id: keep.id })
    .eq('vendor_id', dup.id);

  // Deactivate the duplicate vendor
  await supabase
    .from('vendors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', dup.id);

  return { merged: true, invoicesReassigned, invoicesDeleted };
}

async function main() {
  console.log('🔄 Merging Duplicate Vendors (with Invoice Deduplication)\n');
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
  let totalInvoicesDeleted = 0;

  for (const [normalized, vendorGroup] of duplicateGroups) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Group: "${normalized}"`);
    
    // Sort by invoice count (descending) to keep the one with most invoices
    vendorGroup.sort((a, b) => b.invoiceCount - a.invoiceCount);
    
    const keep = vendorGroup[0];
    const duplicates = vendorGroup.slice(1);
    
    console.log(`  Keeping: "${keep.name}" (${keep.invoiceCount} invoices)`);
    
    for (const dup of duplicates) {
      console.log(`  Merging: "${dup.name}" (${dup.invoiceCount} invoices)`);
      
      const result = await mergeVendorWithDedup(keep, dup);
      
      if (result.merged) {
        totalMerged++;
        totalInvoicesReassigned += result.invoicesReassigned;
        totalInvoicesDeleted += result.invoicesDeleted;
        
        if (result.invoicesReassigned > 0) {
          console.log(`    ✅ Reassigned ${result.invoicesReassigned} invoices`);
        }
        if (result.invoicesDeleted > 0) {
          console.log(`    ✅ Deleted ${result.invoicesDeleted} duplicate invoices`);
        }
        console.log(`    ✅ Deactivated duplicate vendor`);
      }
    }

    // Update keeper's normalized name
    await supabase
      .from('vendors')
      .update({ normalized_name: betterNormalize(keep.name) })
      .eq('id', keep.id);
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 MERGE COMPLETE\n');
  console.log(`  Vendors merged: ${totalMerged}`);
  console.log(`  Invoices reassigned: ${totalInvoicesReassigned}`);
  console.log(`  Duplicate invoices deleted: ${totalInvoicesDeleted}`);
  console.log(`  Remaining active vendors: ${vendors.length - totalMerged}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
