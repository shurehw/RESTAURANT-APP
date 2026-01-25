/**
 * Find invoices that have the same invoice_number across different vendors
 * that we're trying to merge
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findCrossVendorDuplicates() {
  console.log('🔍 Finding cross-vendor duplicates blocking merges...\n');

  // Check Chefs Warehouse
  const { data: chefsWarehouses } = await supabase
    .from('vendors')
    .select('id, name')
    .or('name.eq.The Chefs Warehouse,name.eq.Chefs Warehouse Midwest LLC,name.ilike.%Chefs\' Warehouse of Florida%');

  if (chefsWarehouses && chefsWarehouses.length > 1) {
    console.log('📦 Chefs Warehouse vendors:');
    chefsWarehouses.forEach(v => console.log(`   ${v.name} (${v.id})`));

    const vendorIds = chefsWarehouses.map(v => v.id);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, vendor_id, invoice_number, invoice_date, total_amount, created_at, vendors(name)')
      .in('vendor_id', vendorIds)
      .order('invoice_number')
      .order('created_at');

    if (invoices) {
      const groups = new Map<string, typeof invoices>();
      for (const inv of invoices) {
        if (!groups.has(inv.invoice_number)) {
          groups.set(inv.invoice_number, []);
        }
        groups.get(inv.invoice_number)!.push(inv);
      }

      const duplicates = Array.from(groups.values()).filter(g => g.length > 1);

      if (duplicates.length > 0) {
        console.log(`\n   Found ${duplicates.length} duplicate invoice numbers:\n`);
        duplicates.forEach(group => {
          console.log(`   Invoice #${group[0].invoice_number}:`);
          group.forEach((inv, idx) => {
            const vendor = (inv.vendors as any)?.name || 'Unknown';
            const action = idx === 0 ? '✅ KEEP' : '❌ DELETE';
            console.log(`      ${action}: ${vendor} - ${inv.invoice_date} - $${inv.total_amount} (${inv.id.substring(0, 8)}...)`);
          });
          console.log();
        });
      } else {
        console.log('   ✅ No duplicates\n');
      }
    }
  }

  // Check Dairyland
  const { data: dairylands } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Dairyland%');

  if (dairylands && dairylands.length > 1) {
    console.log('🥛 Dairyland vendors:');
    dairylands.forEach(v => console.log(`   ${v.name} (${v.id})`));

    const vendorIds = dairylands.map(v => v.id);

    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, vendor_id, invoice_number, invoice_date, total_amount, created_at, vendors(name)')
      .in('vendor_id', vendorIds)
      .order('invoice_number')
      .order('created_at');

    if (invoices) {
      const groups = new Map<string, typeof invoices>();
      for (const inv of invoices) {
        if (!groups.has(inv.invoice_number)) {
          groups.set(inv.invoice_number, []);
        }
        groups.get(inv.invoice_number)!.push(inv);
      }

      const duplicates = Array.from(groups.values()).filter(g => g.length > 1);

      if (duplicates.length > 0) {
        console.log(`\n   Found ${duplicates.length} duplicate invoice numbers:\n`);
        duplicates.forEach(group => {
          console.log(`   Invoice #${group[0].invoice_number}:`);
          group.forEach((inv, idx) => {
            const vendor = (inv.vendors as any)?.name || 'Unknown';
            const action = idx === 0 ? '✅ KEEP' : '❌ DELETE';
            console.log(`      ${action}: ${vendor} - ${inv.invoice_date} - $${inv.total_amount} (${inv.id.substring(0, 8)}...)`);
          });
          console.log();
        });
      } else {
        console.log('   ✅ No duplicates\n');
      }
    }
  }
}

findCrossVendorDuplicates().catch(console.error);
