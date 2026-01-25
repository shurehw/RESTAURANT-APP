import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeSyscoVendors() {
  console.log('🔍 Finding SYSCO vendors...\n');

  // Find all SYSCO-related vendors
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name')
    .or('name.ilike.%sysco%,normalized_name.ilike.%sysco%')
    .eq('is_active', true);

  if (error || !vendors) {
    console.error('Error fetching vendors:', error);
    return;
  }

  if (vendors.length === 0) {
    console.log('No SYSCO vendors found');
    return;
  }

  console.log('Found SYSCO vendors:');
  vendors.forEach((v, i) => {
    console.log(`${i + 1}. ${v.name} (${v.id}) - normalized: "${v.normalized_name}"`);
  });

  // Identify the primary vendor (shortest name, likely "SYSCO")
  const primaryVendor = vendors.reduce((prev, curr) =>
    prev.name.length < curr.name.length ? prev : curr
  );

  const duplicateVendors = vendors.filter(v => v.id !== primaryVendor.id);

  if (duplicateVendors.length === 0) {
    console.log('\n✅ No duplicates to merge!');
    return;
  }

  console.log(`\n📋 Primary vendor: ${primaryVendor.name} (${primaryVendor.id})`);
  console.log(`🔄 Merging ${duplicateVendors.length} duplicate(s):\n`);

  for (const duplicate of duplicateVendors) {
    console.log(`Merging "${duplicate.name}" into "${primaryVendor.name}"...`);

    // Get count of invoices to update
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', duplicate.id);

    const { count: vendorItemsCount } = await supabase
      .from('vendor_items')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', duplicate.id);

    console.log(`  - ${invoiceCount || 0} invoices`);
    console.log(`  - ${vendorItemsCount || 0} vendor items`);

    // Update invoices
    if (invoiceCount && invoiceCount > 0) {
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({ vendor_id: primaryVendor.id })
        .eq('vendor_id', duplicate.id);

      if (invoiceError) {
        console.error(`  ❌ Error updating invoices:`, invoiceError);
        continue;
      }
      console.log(`  ✓ Updated ${invoiceCount} invoices`);
    }

    // Update vendor_items
    if (vendorItemsCount && vendorItemsCount > 0) {
      const { error: itemsError } = await supabase
        .from('vendor_items')
        .update({ vendor_id: primaryVendor.id })
        .eq('vendor_id', duplicate.id);

      if (itemsError) {
        console.error(`  ❌ Error updating vendor items:`, itemsError);
        continue;
      }
      console.log(`  ✓ Updated ${vendorItemsCount} vendor items`);
    }

    // Deactivate duplicate vendor
    const { error: deactivateError } = await supabase
      .from('vendors')
      .update({ is_active: false })
      .eq('id', duplicate.id);

    if (deactivateError) {
      console.error(`  ❌ Error deactivating vendor:`, deactivateError);
      continue;
    }

    console.log(`  ✓ Deactivated duplicate vendor\n`);
  }

  console.log('✅ Merge complete!\n');

  // Verify results
  const { data: updatedVendors } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active')
    .or('name.ilike.%sysco%,normalized_name.ilike.%sysco%');

  console.log('📊 Final state:');
  updatedVendors?.forEach(v => {
    console.log(`  ${v.is_active ? '✓' : '✗'} ${v.name} (${v.id})`);
  });

  // Show invoice count for primary vendor
  const { count: finalCount } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', primaryVendor.id);

  console.log(`\n📈 Total invoices for ${primaryVendor.name}: ${finalCount || 0}`);
}

mergeSyscoVendors();
