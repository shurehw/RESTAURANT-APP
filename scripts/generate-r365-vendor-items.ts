/**
 * Generate R365 Vendor Items Import
 * Matches R365 template: Vendor Item Number, Vendor, Item, Purchase U of M, etc.
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function generateR365VendorItems() {
  console.log('📦 Generating R365 Vendor Items Import\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  if (!org) {
    console.error('❌ Organization not found — check Supabase connection');
    return;
  }

  console.log(`Organization: ${org.name}\n`);

  // Fetch all items with pack configurations in batches
  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  console.log('Fetching items with pack configurations...');

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        id,
        sku,
        name,
        base_uom,
        r365_measure_type,
        item_pack_configurations(
          id,
          pack_type,
          display_name,
          units_per_pack,
          unit_size,
          unit_size_uom,
          conversion_factor,
          vendor_id,
          vendor_item_code,
          vendor:vendors(id, name)
        )
      `)
      .eq('organization_id', org!.id)
      .eq('is_active', true)
      .order('sku')
      .range(from, from + batchSize - 1);

    if (error || !items || items.length === 0) break;

    allItems = allItems.concat(items);
    from += batchSize;

    if (items.length < batchSize) break;

    if (from % 1000 === 0) {
      console.log(`  Fetched ${from} items...`);
    }
  }

  console.log(`Total Items: ${allItems.length}\n`);

  // Generate vendor item rows
  const rows: string[] = [];
  rows.push('Vendor Item Number,Vendor,Item,Purchase U of M,Vendor Item Name,Each Amt,Contract Price,Acceptable Variance %,Primary,Contract Expiration');

  let totalVendorItems = 0;
  let itemsWithVendorCodes = 0;
  let itemsWithoutVendorCodes = 0;

  allItems.forEach(item => {
    const packs = (item as any).item_pack_configurations || [];

    if (packs.length === 0) {
      // No pack configs - skip or create default
      return;
    }

    packs.forEach((pack: any, index: number) => {
      const vendor = pack.vendor as any;
      const vendorName = vendor?.name || '';
      const vendorItemNumber = pack.vendor_item_code || '';

      // Determine Purchase UOM - map to R365 valid UOM names
      const rawUOM = (pack.pack_type || 'each').toLowerCase();
      const UOM_MAP: Record<string, string> = {
        'case': 'Case',
        'each': 'Each',
        'bottle': 'Bottle',
        'bag': 'Each',  // R365 has no plain "Bag" UOM
      };
      const purchaseUOM = UOM_MAP[rawUOM] || rawUOM;

      // Determine Each Amt based on measure type
      // For "Each" measure type (wine bottles, produce items, etc.) → use units_per_pack
      // For "Volume" or "Weight" measure types → use conversion_factor
      let eachAmt: number;
      if (item.r365_measure_type === 'Each') {
        // For Each items: 1 case = X eaches (e.g., 6-bottle case = 6 eaches)
        eachAmt = pack.units_per_pack || 1;
      } else {
        // For Volume/Weight: use full conversion (e.g., 6 x 750ml = 4500ml)
        eachAmt = pack.conversion_factor || 1;
      }

      const isPrimary = index === 0 ? 'Y' : 'N'; // First pack config is primary

      // Track stats
      totalVendorItems++;
      if (vendorItemNumber) {
        itemsWithVendorCodes++;
      } else {
        itemsWithoutVendorCodes++;
      }

      rows.push([
        `"${vendorItemNumber}"`,           // Vendor Item Number
        `"${vendorName}"`,                  // Vendor
        `"${item.sku}"`,                    // Item (internal SKU)
        `"${purchaseUOM}"`,                 // Purchase U of M
        `"${item.name}"`,                   // Vendor Item Name
        `${eachAmt}`,                       // Each Amt (conversion factor)
        '',                                 // Contract Price (blank)
        '',                                 // Acceptable Variance % (blank)
        `${isPrimary}`,                     // Primary (Y/N)
        ''                                  // Contract Expiration (blank)
      ].join(','));
    });
  });

  // Split into two files: ready for upload (has vendor) vs needs manual review
  const readyRows = [rows[0]]; // header
  const needsReviewRows = [rows[0]]; // header

  for (let i = 1; i < rows.length; i++) {
    const match = rows[i].match(/^"[^"]*","([^"]*)"/);
    if (match && match[1] !== '') {
      readyRows.push(rows[i]);
    } else {
      needsReviewRows.push(rows[i]);
    }
  }

  fs.writeFileSync('R365_VENDOR_ITEMS.csv', rows.join('\n'));
  fs.writeFileSync('R365_VENDOR_ITEMS_READY.csv', readyRows.join('\n'));
  fs.writeFileSync('R365_VENDOR_ITEMS_NEEDS_VENDOR.csv', needsReviewRows.join('\n'));

  console.log('✅ R365_VENDOR_ITEMS.csv (all items)');
  console.log(`   Total vendor items: ${totalVendorItems}`);
  console.log(`   With vendor codes: ${itemsWithVendorCodes} (${((itemsWithVendorCodes / totalVendorItems) * 100).toFixed(1)}%)`);
  console.log(`   Without vendor codes: ${itemsWithoutVendorCodes} (${((itemsWithoutVendorCodes / totalVendorItems) * 100).toFixed(1)}%)`);
  console.log(`\n✅ R365_VENDOR_ITEMS_READY.csv (upload-ready: ${readyRows.length - 1} items with vendor)`);
  console.log(`✅ R365_VENDOR_ITEMS_NEEDS_VENDOR.csv (needs manual vendor: ${needsReviewRows.length - 1} items)\n`);

  // Count by vendor
  const byVendor = new Map<string, number>();
  allItems.forEach(item => {
    const packs = (item as any).item_pack_configurations || [];
    packs.forEach((pack: any) => {
      const vendor = pack.vendor as any;
      if (vendor?.name) {
        byVendor.set(vendor.name, (byVendor.get(vendor.name) || 0) + 1);
      }
    });
  });

  console.log('Vendor Items by Vendor (Top 20):');
  Array.from(byVendor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([vendor, count]) => {
      console.log(`  ${vendor}: ${count} items`);
    });
  console.log();
}

generateR365VendorItems().catch(console.error);
