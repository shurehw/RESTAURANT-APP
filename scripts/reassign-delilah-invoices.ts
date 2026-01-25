/**
 * Reassign invoices from "Delilah Dallas LLC" vendor to Ben E Keith
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function reassignInvoices() {
  console.log('🔧 Reassigning invoices from "Delilah Dallas LLC" to correct vendor...\n');

  // Find the incorrect vendor
  const { data: delilahVendor } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%Delilah Dallas%')
    .single();

  if (!delilahVendor) {
    console.log('✅ No "Delilah Dallas" vendor found');
    return;
  }

  // Find Ben E Keith vendor
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name')
    .or('name.ilike.%Ben%Keith%,name.ilike.%BEN%KEITH%')
    .limit(5);

  console.log('Available vendors matching "Ben E Keith":');
  vendors?.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.id})`);
  });
  console.log();

  if (!vendors || vendors.length === 0) {
    console.log('❌ No Ben E Keith vendor found. Need to create one first.');
    return;
  }

  const benEKeith = vendors[0]; // Use first match
  console.log(`Selected vendor: "${benEKeith.name}"\n`);

  // Get invoices to reassign
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount')
    .eq('vendor_id', delilahVendor.id);

  if (!invoices || invoices.length === 0) {
    console.log('No invoices to reassign');
    return;
  }

  console.log(`Found ${invoices.length} invoices to reassign:\n`);
  invoices.forEach(inv => {
    console.log(`  - ${inv.invoice_number} (${inv.invoice_date}) - $${inv.total_amount}`);
  });

  console.log(`\n⚠️  Reassigning ${invoices.length} invoices from "${delilahVendor.name}" to "${benEKeith.name}"...\n`);

  // Update the invoices
  const { error: updateError } = await supabase
    .from('invoices')
    .update({ vendor_id: benEKeith.id })
    .eq('vendor_id', delilahVendor.id);

  if (updateError) {
    console.error('❌ Failed to update invoices:', updateError);
    throw updateError;
  }

  console.log('✅ Successfully reassigned all invoices!\n');

  // Check if we should delete the incorrect vendor
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', delilahVendor.id);

  if (count === 0) {
    console.log(`Deleting unused vendor "${delilahVendor.name}"...`);
    const { error: deleteError } = await supabase
      .from('vendors')
      .delete()
      .eq('id', delilahVendor.id);

    if (deleteError) {
      console.error('Could not delete vendor:', deleteError.message);
    } else {
      console.log('✅ Deleted unused vendor\n');
    }
  }

  console.log('✨ Done!');
}

reassignInvoices().catch(console.error);
