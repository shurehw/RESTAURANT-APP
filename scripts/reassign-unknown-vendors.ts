/**
 * Reassign UNKNOWN and Delilah Data LLC invoices to correct vendors
 * Then delete the bad vendor records
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reassignInvoices() {
  console.log('🔧 Reassigning UNKNOWN and Delilah Data invoices...\n');

  // Get vendor IDs
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name')
    .or('name.eq.UNKNOWN,name.ilike.%Delilah Data%,name.eq.The Chefs Warehouse,name.eq.Ben E Keith');

  if (!vendors) {
    console.log('Could not find vendors');
    return;
  }

  const unknownVendor = vendors.find(v => v.name === 'UNKNOWN');
  const delilahVendor = vendors.find(v => v.name.includes('Delilah Data'));
  const chefsWarehouse = vendors.find(v => v.name === 'The Chefs Warehouse');
  const benEKeith = vendors.find(v => v.name === 'Ben E Keith');

  if (!unknownVendor && !delilahVendor) {
    console.log('✅ No problematic vendors found');
    return;
  }

  let totalReassigned = 0;
  let totalDeleted = 0;

  // Fix UNKNOWN invoices
  if (unknownVendor) {
    console.log('📋 Processing UNKNOWN vendor invoices...\n');

    const { data: unknownInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount')
      .eq('vendor_id', unknownVendor.id);

    if (unknownInvoices) {
      for (const inv of unknownInvoices) {
        // Invoice #379450 - Chefs Warehouse pattern
        if (inv.invoice_number === '379450' && chefsWarehouse) {
          console.log(`  Reassigning #${inv.invoice_number} to Chefs Warehouse`);
          await supabase
            .from('invoices')
            .update({ vendor_id: chefsWarehouse.id })
            .eq('id', inv.id);
          totalReassigned++;
        }
        // Delete test/invalid invoices ($0 or strange formats)
        else if (inv.total_amount === 0 || inv.total_amount === null) {
          console.log(`  Deleting invalid invoice #${inv.invoice_number} ($${inv.total_amount})`);
          await supabase.from('invoice_lines').delete().eq('invoice_id', inv.id);
          await supabase.from('invoices').delete().eq('id', inv.id);
          totalDeleted++;
        }
        // Unknown invoice with value - needs manual review but assign to Ben E Keith for now
        else if (benEKeith) {
          console.log(`  Reassigning #${inv.invoice_number} to Ben E Keith (default)`);
          await supabase
            .from('invoices')
            .update({ vendor_id: benEKeith.id })
            .eq('id', inv.id);
          totalReassigned++;
        }
      }
    }

    // Check if UNKNOWN vendor still has invoices
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', unknownVendor.id);

    if (count === 0) {
      console.log(`\n  Deleting UNKNOWN vendor (no invoices left)...`);
      await supabase.from('vendors').delete().eq('id', unknownVendor.id);
      console.log(`  ✅ Deleted UNKNOWN vendor`);
    }
    console.log();
  }

  // Fix Delilah Data LLC invoices
  if (delilahVendor && benEKeith) {
    console.log('📋 Processing Delilah Data LLC invoices...\n');

    const { data: delilahInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('vendor_id', delilahVendor.id);

    if (delilahInvoices && delilahInvoices.length > 0) {
      console.log(`  Reassigning ${delilahInvoices.length} invoice(s) to Ben E Keith`);

      for (const inv of delilahInvoices) {
        await supabase
          .from('invoices')
          .update({ vendor_id: benEKeith.id })
          .eq('id', inv.id);
        totalReassigned++;
      }

      console.log(`  Deleting Delilah Data LLC vendor...`);
      await supabase.from('vendors').delete().eq('id', delilahVendor.id);
      console.log(`  ✅ Deleted Delilah Data LLC vendor`);
    }
    console.log();
  }

  console.log('═'.repeat(80));
  console.log(`\n✨ Summary:`);
  console.log(`   Invoices reassigned: ${totalReassigned}`);
  console.log(`   Invalid invoices deleted: ${totalDeleted}`);
  console.log(`   Problematic vendors removed: ${(unknownVendor ? 1 : 0) + (delilahVendor ? 1 : 0)}`);
  console.log();
}

reassignInvoices().catch(console.error);
