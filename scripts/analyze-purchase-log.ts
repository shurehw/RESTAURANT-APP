/**
 * Analyze Beverage Purchase Log
 * Compare actual purchases against our R365 purchase items
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PurchaseRecord {
  store: string;
  id: string;
  sku: string;
  item: string;
  packSize: string;
  vintage: string;
  category: string;
  subcategory: string;
  vendor: string;
  invoiceNo: string;
  receivedDate: string;
  invoiceDate: string;
  quantity: number;
  amount: number;
  cuPrice: number;
}

async function analyzePurchaseLog() {
  console.log('📊 Analyzing Beverage Purchase Log\n');

  // Read Excel file
  const workbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Parse data (skip header rows)
  const purchases: PurchaseRecord[] = [];
  for (let i = 6; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 10) continue;

    purchases.push({
      store: row[0] || '',
      id: row[1] || '',
      sku: row[2] || '',
      item: row[3] || '',
      packSize: row[4] || '',
      vintage: row[5] || '',
      category: row[6] || '',
      subcategory: row[7] || '',
      vendor: row[8] || '',
      invoiceNo: row[9] || '',
      receivedDate: row[10] || '',
      invoiceDate: row[11] || '',
      quantity: parseFloat(row[12]) || 0,
      amount: parseFloat(row[13]) || 0,
      cuPrice: parseFloat(row[14]) || 0
    });
  }

  console.log(`✅ Loaded ${purchases.length} purchase records\n`);

  // Get existing items from database
  const { data: existingItems } = await supabase
    .from('items')
    .select('sku, name, item_pack_configurations(pack_type, units_per_pack, unit_size, unit_size_uom, vendor_item_code)')
    .eq('is_active', true);

  const existingSkus = new Set(existingItems?.map(i => i.sku) || []);
  const existingPackConfigs = new Map<string, any[]>();

  existingItems?.forEach(item => {
    existingPackConfigs.set(item.sku, (item as any).item_pack_configurations || []);
  });

  // Analyze unique values
  const uniqueVendors = new Set<string>();
  const uniquePackSizes = new Set<string>();
  const uniqueCategories = new Set<string>();
  const vendorSkuMap = new Map<string, Set<string>>(); // vendor -> SKUs

  purchases.forEach(p => {
    if (p.vendor) uniqueVendors.add(p.vendor);
    if (p.packSize) uniquePackSizes.add(p.packSize);
    if (p.category) uniqueCategories.add(p.category);

    if (p.vendor && p.sku) {
      if (!vendorSkuMap.has(p.vendor)) {
        vendorSkuMap.set(p.vendor, new Set());
      }
      vendorSkuMap.get(p.vendor)!.add(p.sku);
    }
  });

  // Analysis 1: Vendors
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 VENDORS IN PURCHASE LOG');
  console.log('═══════════════════════════════════════════════════════\n');

  const vendorStats = Array.from(uniqueVendors).map(vendor => {
    const records = purchases.filter(p => p.vendor === vendor);
    const totalAmount = records.reduce((sum, p) => sum + p.amount, 0);
    const skuCount = vendorSkuMap.get(vendor)?.size || 0;
    return {
      vendor,
      orderCount: records.length,
      totalAmount,
      skuCount
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount);

  console.log('Top Vendors by Spend:\n');
  vendorStats.slice(0, 10).forEach(v => {
    console.log(`${v.vendor}`);
    console.log(`  Orders: ${v.orderCount} | SKUs: ${v.skuCount} | Total: $${v.totalAmount.toLocaleString()}\n`);
  });

  // Analysis 2: Pack Sizes
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 PACK SIZES IN PURCHASE LOG');
  console.log('═══════════════════════════════════════════════════════\n');

  const packSizeStats = Array.from(uniquePackSizes).map(packSize => {
    const count = purchases.filter(p => p.packSize === packSize).length;
    return { packSize, count };
  }).sort((a, b) => b.count - a.count);

  console.log('Most Common Pack Sizes:\n');
  packSizeStats.slice(0, 20).forEach(p => {
    console.log(`${p.packSize.padEnd(30)} : ${p.count} purchases`);
  });
  console.log('');

  // Analysis 3: Missing Items
  console.log('═══════════════════════════════════════════════════════');
  console.log('❌ ITEMS IN PURCHASE LOG NOT IN DATABASE');
  console.log('═══════════════════════════════════════════════════════\n');

  const purchasedSkus = new Set(purchases.map(p => p.sku).filter(Boolean));
  const missingSkus = Array.from(purchasedSkus).filter(sku => !existingSkus.has(sku));

  console.log(`Missing SKUs: ${missingSkus.length} / ${purchasedSkus.size}\n`);

  if (missingSkus.length > 0) {
    console.log('Top 20 Missing Items:\n');
    const missingItems = missingSkus.map(sku => {
      const records = purchases.filter(p => p.sku === sku);
      const sample = records[0];
      const totalQty = records.reduce((sum, p) => sum + p.quantity, 0);
      const totalAmount = records.reduce((sum, p) => sum + p.amount, 0);
      return {
        sku,
        item: sample.item,
        packSize: sample.packSize,
        vendor: sample.vendor,
        category: sample.category,
        purchaseCount: records.length,
        totalQty,
        totalAmount
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);

    missingItems.slice(0, 20).forEach(item => {
      console.log(`SKU: ${item.sku}`);
      console.log(`  Item: ${item.item}`);
      console.log(`  Pack: ${item.packSize}`);
      console.log(`  Vendor: ${item.vendor}`);
      console.log(`  Purchases: ${item.purchaseCount} orders | $${item.totalAmount.toLocaleString()}\n`);
    });
  }

  // Analysis 4: Missing Pack Configurations
  console.log('═══════════════════════════════════════════════════════');
  console.log('⚠️  ITEMS WITH MISSING PACK CONFIGURATIONS');
  console.log('═══════════════════════════════════════════════════════\n');

  const itemsNeedingPacks: any[] = [];

  purchases.forEach(p => {
    if (!p.sku || !existingSkus.has(p.sku)) return;

    const packs = existingPackConfigs.get(p.sku) || [];
    const packSize = p.packSize;

    // Check if this pack size exists
    const hasMatchingPack = packs.some(pack => {
      const displayName = pack.units_per_pack > 1
        ? `${pack.units_per_pack} x ${pack.unit_size}${pack.unit_size_uom}`
        : `${pack.unit_size}${pack.unit_size_uom}`;

      return packSize.includes(displayName) || displayName.includes(packSize);
    });

    if (!hasMatchingPack) {
      itemsNeedingPacks.push({
        sku: p.sku,
        item: p.item,
        purchasedPackSize: packSize,
        existingPacks: packs.length,
        vendor: p.vendor
      });
    }
  });

  const uniqueNeedingPacks = Array.from(
    new Map(itemsNeedingPacks.map(item => [item.sku, item])).values()
  );

  console.log(`Items needing pack configs: ${uniqueNeedingPacks.length}\n`);

  if (uniqueNeedingPacks.length > 0) {
    uniqueNeedingPacks.slice(0, 20).forEach(item => {
      console.log(`SKU: ${item.sku} - ${item.item}`);
      console.log(`  Purchased as: ${item.purchasedPackSize}`);
      console.log(`  Current packs: ${item.existingPacks}`);
      console.log(`  Vendor: ${item.vendor}\n`);
    });
  }

  // Analysis 5: Vendor Item Codes
  console.log('═══════════════════════════════════════════════════════');
  console.log('🏷️  VENDOR ITEM CODE MAPPING');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Sample vendor SKU mappings (for adding to pack configs):\n');

  const vendorMappings = new Map<string, Map<string, string>>(); // ourSKU -> vendor -> vendorSKU

  purchases.forEach(p => {
    if (!p.sku || !p.id || !p.vendor) return;

    if (!vendorMappings.has(p.sku)) {
      vendorMappings.set(p.sku, new Map());
    }
    vendorMappings.get(p.sku)!.set(p.vendor, p.id);
  });

  let mappingCount = 0;
  for (const [ourSku, vendorMap] of vendorMappings.entries()) {
    if (mappingCount >= 10) break;

    const item = purchases.find(p => p.sku === ourSku);
    console.log(`${ourSku} - ${item?.item}`);
    for (const [vendor, vendorSku] of vendorMap.entries()) {
      console.log(`  ${vendor}: ${vendorSku}`);
    }
    console.log('');
    mappingCount++;
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`✅ Total Purchase Records: ${purchases.length}`);
  console.log(`✅ Unique Vendors: ${uniqueVendors.size}`);
  console.log(`✅ Unique Pack Sizes: ${uniquePackSizes.size}`);
  console.log(`✅ Unique SKUs Purchased: ${purchasedSkus.size}`);
  console.log(`❌ Missing SKUs in DB: ${missingSkus.length}`);
  console.log(`⚠️  Items Needing Pack Configs: ${uniqueNeedingPacks.length}\n`);

  console.log('🎯 RECOMMENDATIONS:\n');
  console.log(`1. Add ${missingSkus.length} missing items to database`);
  console.log(`2. Add pack configurations for ${uniqueNeedingPacks.length} items`);
  console.log(`3. Add vendor item codes to pack configurations`);
  console.log(`4. Verify all ${uniqueVendors.size} vendors exist in vendors table\n`);
}

analyzePurchaseLog().catch(console.error);
