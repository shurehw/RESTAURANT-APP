import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function mergeOakFarmsDuplicate() {
  const supabase = createAdminClient();

  console.log('\n🔧 Merging Oak Farms duplicate...\n');

  // Get both Oak Farms vendors (there are two with slightly different normalized names)
  const { data: oakFarms, error: fetchError } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, created_at')
    .ilike('normalized_name', 'oak farms%dallas dfa dairy brands')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('❌ Failed to fetch Oak Farms vendors:', fetchError.message);
    return;
  }

  if (!oakFarms || oakFarms.length < 2) {
    console.log('No duplicates found.');
    return;
  }

  console.log(`Found ${oakFarms.length} Oak Farms vendors:`);
  oakFarms.forEach((v, i) => {
    console.log(`  ${i + 1}. ${v.name} (${v.id}) - Created: ${v.created_at}`);
  });

  // Keep the older one (first created), delete the newer one
  const keepVendor = oakFarms[0];
  const deleteVendor = oakFarms[1];

  console.log(`\nKeeping: ${keepVendor.name} (${keepVendor.id})`);
  console.log(`Deleting: ${deleteVendor.name} (${deleteVendor.id})`);

  // Check if there are any invoices using the duplicate
  const { data: invoices, error: invoiceError } = await supabase
    .from('invoices')
    .select('id')
    .eq('vendor_id', deleteVendor.id);

  if (invoiceError) {
    console.error('❌ Failed to check invoices:', invoiceError.message);
    return;
  }

  if (invoices && invoices.length > 0) {
    console.log(`\n⚠️  Found ${invoices.length} invoices using the duplicate vendor. Reassigning...`);

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ vendor_id: keepVendor.id })
      .eq('vendor_id', deleteVendor.id);

    if (updateError) {
      console.error('❌ Failed to reassign invoices:', updateError.message);
      return;
    }

    console.log('✅ Reassigned all invoices');
  }

  // Delete the duplicate vendor
  const { error: deleteError } = await supabase
    .from('vendors')
    .delete()
    .eq('id', deleteVendor.id);

  if (deleteError) {
    console.error('❌ Failed to delete duplicate vendor:', deleteError.message);
    return;
  }

  console.log('✅ Deleted duplicate vendor');
  console.log('\n📊 Merge complete!');
}

mergeOakFarmsDuplicate()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
