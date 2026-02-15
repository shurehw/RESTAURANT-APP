/**
 * Check Dallas Purchase Items (Pack Configurations)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDallasPurchaseItems() {
  console.log('📦 Checking Dallas Purchase Items (Pack Configs)\n');

  // Get Dallas venue
  const { data: dallas } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%dallas%')
    .single();

  console.log(`Dallas Venue: ${dallas?.name}\n`);

  // Get all Dallas invoice line items
  const { data: dallasInvoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('venue_id', dallas!.id);

  const invoiceIds = dallasInvoices?.map(i => i.id) || [];

  console.log(`Dallas Invoices: ${invoiceIds.length}\n`);

  // Get all line items from Dallas invoices
  const { data: allLines } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      item_id,
      qty,
      unit_cost
    `)
    .in('invoice_id', invoiceIds);

  console.log(`Total Dallas Invoice Lines: ${allLines?.length || 0}`);

  const linesWithItems = allLines?.filter(l => l.item_id) || [];
  const uniqueItemIds = new Set(linesWithItems.map(l => l.item_id));

  console.log(`Matched Line Items: ${linesWithItems.length}`);
  console.log(`Unique Items Used by Dallas: ${uniqueItemIds.size}\n`);

  // Get those items with their pack configurations (in batches)
  const itemIdsArray = Array.from(uniqueItemIds);
  const dallasItems: any[] = [];
  const batchSize = 100;

  for (let i = 0; i < itemIdsArray.length; i += batchSize) {
    const batch = itemIdsArray.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from('items')
      .select(`
        id,
        sku,
        name,
        category,
        item_pack_configurations(
          id,
          pack_type,
          units_per_pack,
          unit_size,
          unit_size_uom,
          vendor_id,
          vendor_item_code
        )
      `)
      .in('id', batch);

    if (error) {
      console.error(`Error fetching batch ${i / batchSize + 1}:`, error);
      continue;
    }

    if (data) {
      dallasItems.push(...data);
    }
  }

  console.log(`Fetched ${dallasItems.length} items\n`);

  console.log('═══════════════════════════════════════════════════════');
  console.log('DALLAS ITEMS - PACK CONFIGURATION STATUS');
  console.log('═══════════════════════════════════════════════════════\n');

  const itemsWithPacks = dallasItems?.filter(item =>
    (item as any).item_pack_configurations?.length > 0
  ) || [];

  const itemsWithoutPacks = dallasItems?.filter(item =>
    !(item as any).item_pack_configurations || (item as any).item_pack_configurations.length === 0
  ) || [];

  const itemsWithVendorCodes = dallasItems?.filter(item => {
    const packs = (item as any).item_pack_configurations || [];
    return packs.some((p: any) => p.vendor_item_code);
  }) || [];

  console.log(`Items WITH pack configs: ${itemsWithPacks.length} (${((itemsWithPacks.length / dallasItems!.length) * 100).toFixed(1)}%)`);
  console.log(`Items WITHOUT pack configs: ${itemsWithoutPacks.length}`);
  console.log(`Items WITH vendor codes: ${itemsWithVendorCodes.length} (${((itemsWithVendorCodes.length / dallasItems!.length) * 100).toFixed(1)}%)\n`);

  // Check Dallas vendors
  const { data: dallasVendors } = await supabase
    .from('invoices')
    .select('vendor:vendors(id, name)')
    .eq('venue_id', dallas!.id);

  const uniqueVendors = new Map();
  dallasVendors?.forEach(inv => {
    const vendor = (inv.vendor as any);
    if (vendor?.id) {
      uniqueVendors.set(vendor.id, vendor.name);
    }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('DALLAS VENDORS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Unique Dallas Vendors: ${uniqueVendors.size}\n`);
  Array.from(uniqueVendors.values()).slice(0, 15).forEach(name => {
    console.log(`  - ${name}`);
  });

  console.log('\n');

  // Check if pack configs match Dallas vendors
  let packsWithDallasVendor = 0;
  let packsWithOtherVendor = 0;
  let packsWithNoVendor = 0;

  dallasItems?.forEach(item => {
    const packs = (item as any).item_pack_configurations || [];
    packs.forEach((pack: any) => {
      if (pack.vendor_id && uniqueVendors.has(pack.vendor_id)) {
        packsWithDallasVendor++;
      } else if (pack.vendor_id) {
        packsWithOtherVendor++;
      } else {
        packsWithNoVendor++;
      }
    });
  });

  const totalPacks = packsWithDallasVendor + packsWithOtherVendor + packsWithNoVendor;

  console.log('═══════════════════════════════════════════════════════');
  console.log('PACK CONFIGURATION VENDOR ANALYSIS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total Pack Configs for Dallas Items: ${totalPacks}`);
  console.log(`  - Linked to Dallas vendors: ${packsWithDallasVendor} (${totalPacks > 0 ? ((packsWithDallasVendor / totalPacks) * 100).toFixed(1) : 0}%)`);
  console.log(`  - Linked to other vendors: ${packsWithOtherVendor} (${totalPacks > 0 ? ((packsWithOtherVendor / totalPacks) * 100).toFixed(1) : 0}%)`);
  console.log(`  - No vendor linked: ${packsWithNoVendor} (${totalPacks > 0 ? ((packsWithNoVendor / totalPacks) * 100).toFixed(1) : 0}%)\n`);

  // Show items without packs
  if (itemsWithoutPacks.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('ITEMS WITHOUT PACK CONFIGS (First 20)');
    console.log('═══════════════════════════════════════════════════════\n');

    itemsWithoutPacks.slice(0, 20).forEach(item => {
      console.log(`  ${item.sku} - ${item.name}`);
      console.log(`    Category: ${item.category}`);
    });
    console.log();
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const packCoverage = ((itemsWithPacks.length / dallasItems!.length) * 100).toFixed(1);
  const vendorCodeCoverage = ((itemsWithVendorCodes.length / dallasItems!.length) * 100).toFixed(1);
  const dallasVendorMatch = totalPacks > 0 ? ((packsWithDallasVendor / totalPacks) * 100).toFixed(1) : '0';

  console.log(`✅ Pack Config Coverage: ${packCoverage}%`);
  console.log(`✅ Vendor Code Coverage: ${vendorCodeCoverage}%`);
  console.log(`⚠️  Dallas Vendor Match: ${dallasVendorMatch}%\n`);

  if (parseFloat(dallasVendorMatch) < 50) {
    console.log('⚠️  LOW DALLAS VENDOR MATCH!\n');
    console.log('Most pack configs are for LA vendors (Bird Street).');
    console.log('Dallas uses different vendors than LA.\n');
    console.log('Recommendations:');
    console.log('  1. Create Dallas-specific pack configs with Dallas vendor IDs');
    console.log('  2. Extract vendor SKUs from Dallas OCR invoices');
    console.log('  3. Link pack configs to: Marbool, Chef\'s Produce, Allen Brothers TX, etc.');
    console.log('  4. This will enable proper R365 vendor matching for Dallas\n');
  } else {
    console.log('✅ Good vendor match! Pack configs align with Dallas vendors.\n');
  }
}

checkDallasPurchaseItems().catch(console.error);
