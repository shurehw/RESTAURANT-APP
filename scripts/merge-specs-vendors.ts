import { createClient } from '@supabase/supabase-js';

async function mergeSpecsVendors() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Merging Spec\'s vendor duplicates...\n');

  // The canonical vendor to keep
  const keepVendorId = '9f637b57-3ac7-48c3-bfab-aa653ccd9c34'; // Spec's Wine, Spirits & Finer Foods
  const keepVendorName = "Spec's Wine, Spirits & Finer Foods";

  // Vendors to merge into the canonical one
  const mergeVendorIds = [
    '39f82e13-1b85-4e58-9556-1652179de7fa', // Spec's Liquors
    '620b66ab-2967-4dfa-a588-0936bd83ed03'  // Duplicate Spec's Wine, Spirits & Finer Foods
  ];

  console.log(`Keeping: ${keepVendorName} (${keepVendorId})`);
  console.log('Merging these vendors into it:');

  for (const vendorId of mergeVendorIds) {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('name')
      .eq('id', vendorId)
      .single();

    console.log(`  - ${vendor?.name || 'Unknown'} (${vendorId})`);
  }

  console.log('\nUpdating invoices...');

  // Update all invoices from the duplicate vendors to point to the canonical vendor
  for (const oldVendorId of mergeVendorIds) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('vendor_id', oldVendorId);

    if (invoices && invoices.length > 0) {
      console.log(`  Moving ${invoices.length} invoices from ${oldVendorId}...`);

      const { error } = await supabase
        .from('invoices')
        .update({ vendor_id: keepVendorId })
        .eq('vendor_id', oldVendorId);

      if (error) {
        console.error(`  Error updating invoices:`, error);
      } else {
        console.log(`  ✓ Moved ${invoices.length} invoices`);
      }
    } else {
      console.log(`  No invoices found for ${oldVendorId}`);
    }
  }

  console.log('\nDeleting duplicate vendor records...');

  for (const vendorId of mergeVendorIds) {
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', vendorId);

    if (error) {
      console.error(`  Error deleting ${vendorId}:`, error);
    } else {
      console.log(`  ✓ Deleted vendor ${vendorId}`);
    }
  }

  console.log('\n✅ Vendor merge complete!');
  console.log(`All Spec's invoices now use: ${keepVendorName}`);

  // Verify
  const { data: specsInvoices, count } = await supabase
    .from('invoices')
    .select('*', { count: 'exact' })
    .eq('vendor_id', keepVendorId);

  console.log(`\nTotal invoices for Spec's: ${count}`);
}

mergeSpecsVendors();
