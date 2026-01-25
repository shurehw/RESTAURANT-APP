/**
 * Merge "Keith Foods" into "Ben E Keith"
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function mergeKeithVendors() {
  console.log('🔧 Merging Keith Foods into Ben E Keith...\n');

  // Find both vendors
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name')
    .or('name.eq.Keith Foods,name.eq.Ben E Keith');

  if (!vendors || vendors.length !== 2) {
    console.log('⚠️  Could not find both vendors');
    return;
  }

  const benEKeith = vendors.find(v => v.name === 'Ben E Keith')!;
  const keithFoods = vendors.find(v => v.name === 'Keith Foods')!;

  console.log(`Ben E Keith: ${benEKeith.id}`);
  console.log(`Keith Foods: ${keithFoods.id}\n`);

  // Check for duplicate invoice numbers
  const { data: benInvoices } = await supabase
    .from('invoices')
    .select('invoice_number')
    .eq('vendor_id', benEKeith.id);

  const { data: keithInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount')
    .eq('vendor_id', keithFoods.id);

  if (keithInvoices && benInvoices) {
    const benNumbers = new Set(benInvoices.map(inv => inv.invoice_number));
    const duplicates = keithInvoices.filter(inv => benNumbers.has(inv.invoice_number));

    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate invoice numbers:`);
      duplicates.forEach(inv => {
        console.log(`   #${inv.invoice_number} - ${inv.invoice_date} - $${inv.total_amount}`);
      });
      console.log('\nDeleting duplicates from Keith Foods...');

      const deleteIds = duplicates.map(inv => inv.id);
      await supabase.from('invoice_lines').delete().in('invoice_id', deleteIds);
      await supabase.from('invoices').delete().in('id', deleteIds);

      console.log(`✅ Deleted ${duplicates.length} duplicates\n`);
    } else {
      console.log('✅ No duplicate invoice numbers\n');
    }

    console.log(`Merging ${keithInvoices.length - duplicates.length} invoices from Keith Foods to Ben E Keith...`);
  }

  // Update invoices
  const { error: invoiceError } = await supabase
    .from('invoices')
    .update({ vendor_id: benEKeith.id })
    .eq('vendor_id', keithFoods.id);

  if (invoiceError) {
    console.error('❌ Failed to update invoices:', invoiceError.message);
    return;
  }

  // Update vendor aliases
  await supabase
    .from('vendor_item_aliases')
    .update({ vendor_id: benEKeith.id })
    .eq('vendor_id', keithFoods.id);

  // Delete Keith Foods vendor
  const { error: deleteError } = await supabase
    .from('vendors')
    .delete()
    .eq('id', keithFoods.id);

  if (deleteError) {
    console.error('❌ Failed to delete vendor:', deleteError.message);
    return;
  }

  console.log('✅ Successfully merged Keith Foods into Ben E Keith!');
  console.log('\n✨ Done!\n');
}

mergeKeithVendors().catch(console.error);
