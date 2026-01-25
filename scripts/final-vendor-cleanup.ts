/**
 * Final vendor cleanup - delete cross-vendor duplicates and merge vendors
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function cleanup() {
  console.log('🧹 Final vendor cleanup...\n');

  // Step 1: Delete Chefs Warehouse cross-vendor duplicates
  console.log('Step 1: Deleting Chefs Warehouse duplicates...');

  const { data: chefsVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .or('name.eq.The Chefs Warehouse,name.eq.Chefs Warehouse Midwest LLC');

  if (chefsVendors && chefsVendors.length === 2) {
    const mainVendor = chefsVendors.find(v => v.name === 'The Chefs Warehouse')!;
    const midwestVendor = chefsVendors.find(v => v.name === 'Chefs Warehouse Midwest LLC')!;

    // Find all invoices from both
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('id, vendor_id, invoice_number, created_at')
      .in('vendor_id', [mainVendor.id, midwestVendor.id])
      .order('invoice_number')
      .order('created_at');

    if (allInvoices) {
      const groups = new Map<string, typeof allInvoices>();
      for (const inv of allInvoices) {
        if (!groups.has(inv.invoice_number)) {
          groups.set(inv.invoice_number, []);
        }
        groups.get(inv.invoice_number)!.push(inv);
      }

      const deleteIds: string[] = [];
      for (const [num, group] of groups.entries()) {
        if (group.length > 1) {
          // Keep first (earliest created), delete rest
          deleteIds.push(...group.slice(1).map(inv => inv.id));
        }
      }

      if (deleteIds.length > 0) {
        console.log(`  Deleting ${deleteIds.length} duplicate invoices...`);
        await supabase.from('invoice_lines').delete().in('invoice_id', deleteIds);
        await supabase.from('invoices').delete().in('id', deleteIds);
        console.log(`  ✅ Deleted`);
      } else {
        console.log(`  ✅ No duplicates`);
      }
    }

    // Now merge
    console.log(`  Merging Midwest into main...`);
    const { error } = await supabase
      .from('invoices')
      .update({ vendor_id: mainVendor.id })
      .eq('vendor_id', midwestVendor.id);

    if (error) {
      console.log(`  ❌ Error:`, error.message);
    } else {
      await supabase.from('vendors').delete().eq('id', midwestVendor.id);
      console.log(`  ✅ Merged!`);
    }
  }
  console.log();

  // Step 2: Delete Dairyland duplicates
  console.log('Step 2: Deleting Dairyland duplicates...');

  const { data: dairyVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Dairyland%');

  if (dairyVendors && dairyVendors.length === 2) {
    const dbaVendor = dairyVendors.find(v => v.name.includes('dba'))!;
    const plainVendor = dairyVendors.find(v => !v.name.includes('dba'))!;

    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('id, vendor_id, invoice_number, created_at')
      .in('vendor_id', [dbaVendor.id, plainVendor.id])
      .order('invoice_number')
      .order('created_at');

    if (allInvoices) {
      const groups = new Map<string, typeof allInvoices>();
      for (const inv of allInvoices) {
        if (!groups.has(inv.invoice_number)) {
          groups.set(inv.invoice_number, []);
        }
        groups.get(inv.invoice_number)!.push(inv);
      }

      const deleteIds: string[] = [];
      for (const [num, group] of groups.entries()) {
        if (group.length > 1) {
          deleteIds.push(...group.slice(1).map(inv => inv.id));
        }
      }

      if (deleteIds.length > 0) {
        console.log(`  Deleting ${deleteIds.length} duplicate invoices...`);
        await supabase.from('invoice_lines').delete().in('invoice_id', deleteIds);
        await supabase.from('invoices').delete().in('id', deleteIds);
        console.log(`  ✅ Deleted`);
      } else {
        console.log(`  ✅ No duplicates`);
      }
    }

    // Merge into DBA version
    console.log(`  Merging plain into DBA version...`);
    const { error } = await supabase
      .from('invoices')
      .update({ vendor_id: dbaVendor.id })
      .eq('vendor_id', plainVendor.id);

    if (error) {
      console.log(`  ❌ Error:`, error.message);
    } else {
      await supabase.from('vendors').delete().eq('id', plainVendor.id);
      console.log(`  ✅ Merged!`);
    }
  }
  console.log();

  console.log('✨ Cleanup complete!\n');
}

cleanup().catch(console.error);
