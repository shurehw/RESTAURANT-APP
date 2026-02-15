/**
 * Import Missing Items from Purchase Logs
 * Creates items and pack configurations for items not in database
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PurchaseItem {
  vendorSku: string;
  itemName: string;
  packSize: string;
  category: string;
  subcategory: string;
  vendor: string;
  type: 'food' | 'beverage';
  totalSpend: number;
  orderCount: number;
}

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function parsePackSize(packSize: string): {
  packType: string;
  unitsPerPack: number;
  unitSize: number;
  unitSizeUom: string;
} {
  // Parse pack sizes like "6 x 750ml", "12 x 1L", "1lb", "50 x 1lb", etc.

  // Pattern: "6 x 750ml"
  const multiPackMatch = packSize.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)([a-zA-Z]+)/i);
  if (multiPackMatch) {
    return {
      packType: 'case',
      unitsPerPack: parseFloat(multiPackMatch[1]),
      unitSize: parseFloat(multiPackMatch[2]),
      unitSizeUom: multiPackMatch[3].toLowerCase()
    };
  }

  // Pattern: "750ml" or "1lb"
  const singleMatch = packSize.match(/(\d+\.?\d*)([a-zA-Z]+)/i);
  if (singleMatch) {
    return {
      packType: 'each',
      unitsPerPack: 1,
      unitSize: parseFloat(singleMatch[1]),
      unitSizeUom: singleMatch[2].toLowerCase()
    };
  }

  // Pattern: "1each"
  if (packSize.toLowerCase().includes('each')) {
    return {
      packType: 'each',
      unitsPerPack: 1,
      unitSize: 1,
      unitSizeUom: 'each'
    };
  }

  // Default fallback
  return {
    packType: 'each',
    unitsPerPack: 1,
    unitSize: 1,
    unitSizeUom: 'each'
  };
}

function inferMeasureType(category: string, packSize: string): string {
  const cat = category.toLowerCase();
  const pack = packSize.toLowerCase();

  // Beverages are Volume
  if (cat.includes('wine') || cat.includes('beer') || cat.includes('liquor') ||
      cat.includes('beverage') || cat.includes('n/a beverage')) {
    return 'Volume';
  }

  // Check pack size UOM
  if (pack.includes('ml') || pack.includes('l') || pack.includes('oz') ||
      pack.includes('gal') || pack.includes('qt')) {
    return 'Volume';
  }

  if (pack.includes('lb') || pack.includes('kg') || pack.includes('g')) {
    return 'Weight';
  }

  // Default to Each for countable items
  return 'Each';
}

function inferBaseUOM(measureType: string, packSize: string): string {
  if (measureType === 'Volume') {
    return 'oz'; // fluid ounces
  } else if (measureType === 'Weight') {
    return 'oz'; // ounces (weight)
  } else {
    return 'ea';
  }
}

function inferCategory(r365Category: string, type: 'food' | 'beverage'): string {
  const cat = r365Category.toLowerCase();

  // Beverages
  if (cat.includes('wine')) return 'wine';
  if (cat.includes('beer')) return 'beer';
  if (cat.includes('liquor') || cat.includes('spirits')) return 'liquor';
  if (cat.includes('n/a beverage')) return 'beverage';

  // Food
  if (cat.includes('meat')) return 'meat';
  if (cat.includes('seafood')) return 'seafood';
  if (cat.includes('produce')) return 'produce';
  if (cat.includes('dairy')) return 'dairy';
  if (cat.includes('grocery') || cat.includes('dry goods')) return 'grocery';
  if (cat.includes('bakery')) return 'bakery';

  // Default based on type
  return type === 'beverage' ? 'beverage' : 'food';
}

async function importMissingItems(dryRun: boolean = true) {
  console.log('📥 Importing Missing Items from Purchase Logs\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚠️  LIVE MODE (will create items)'}\n`);

  // Get organization ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  if (!org) {
    console.error('❌ Organization not found');
    return;
  }

  console.log(`Organization ID: ${org.id}\n`);

  // Read purchase logs
  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  // Parse all purchases
  const allPurchases: any[] = [];

  // Beverage
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 10) continue;
    allPurchases.push({
      type: 'beverage',
      vendorSku: row[2] || '',
      itemName: row[3] || '',
      packSize: row[4] || '',
      category: row[6] || '',
      subcategory: row[7] || '',
      vendor: row[8] || '',
      amount: parseFloat(row[13]) || 0
    });
  }

  // Food
  for (let i = 6; i < foodData.length; i++) {
    const row = foodData[i];
    if (!row || row.length < 10) continue;
    allPurchases.push({
      type: 'food',
      vendorSku: row[2] || '',
      itemName: row[3] || '',
      packSize: row[4] || '',
      category: row[5] || '',
      subcategory: row[6] || '',
      vendor: row[7] || '',
      amount: parseFloat(row[12]) || 0
    });
  }

  console.log(`📦 Total Purchase Records: ${allPurchases.length}\n`);

  // Aggregate by vendor SKU
  const itemMap = new Map<string, PurchaseItem>();

  allPurchases.forEach(p => {
    if (!p.vendorSku || !p.itemName) return;

    if (!itemMap.has(p.vendorSku)) {
      itemMap.set(p.vendorSku, {
        vendorSku: p.vendorSku,
        itemName: p.itemName,
        packSize: p.packSize,
        category: p.category,
        subcategory: p.subcategory,
        vendor: p.vendor,
        type: p.type,
        totalSpend: 0,
        orderCount: 0
      });
    }

    const item = itemMap.get(p.vendorSku)!;
    item.totalSpend += p.amount;
    item.orderCount++;
  });

  console.log(`📊 Unique Items in Purchase Logs: ${itemMap.size}\n`);

  // Get existing items
  const { data: existingItems } = await supabase
    .from('items')
    .select('id, sku, name')
    .eq('organization_id', org.id);

  const existingNames = new Set(
    existingItems?.map(item => normalizeItemName(item.name)) || []
  );

  console.log(`📊 Existing Items in Database: ${existingItems?.length || 0}\n`);

  // Filter out non-inventory operational items
  function isInventoryItem(item: PurchaseItem): boolean {
    const cat = item.category.toLowerCase();

    // Exclude operational expenses (not inventory)
    if (cat.includes('linen')) return false;
    if (cat.includes('laundry')) return false;
    if (cat.includes('professional services')) return false;
    if (cat.includes('consulting')) return false;
    if (cat.includes('silver')) return false;
    if (cat.includes('tableware') && cat.includes('smallwares')) return false;
    if (cat.includes('glassware')) return false;
    if (cat.includes('paper and packaging')) return false;
    if (cat.includes('cleaning supplies')) return false;
    if (cat.includes('uniforms')) return false;
    if (cat.includes('dues and subscriptions')) return false;
    if (cat.includes('valet')) return false;
    if (cat.includes('band')) return false;
    if (cat.includes('flowers')) return false;

    // Keep food & beverage inventory
    if (cat.includes('meat')) return true;
    if (cat.includes('seafood')) return true;
    if (cat.includes('produce')) return true;
    if (cat.includes('dairy')) return true;
    if (cat.includes('grocery')) return true;
    if (cat.includes('dry goods')) return true;
    if (cat.includes('bakery')) return true;
    if (cat.includes('wine')) return true;
    if (cat.includes('beer')) return true;
    if (cat.includes('liquor')) return true;
    if (cat.includes('beverage')) return true;
    if (cat.includes('bar consumables')) return true;

    // Default: keep if looks like food/bev (5xxx categories)
    if (item.category.match(/^5\d{3}/)) return true;

    // Exclude everything else (7xxx = operational)
    return false;
  }

  // Find missing items (not in database)
  const candidateItems = Array.from(itemMap.values())
    .filter(item => !existingNames.has(normalizeItemName(item.itemName)))
    .filter(isInventoryItem); // Only inventory items

  // Deduplicate by item name (keep highest spend version)
  const deduplicatedMap = new Map<string, PurchaseItem>();
  candidateItems.forEach(item => {
    const normalizedName = normalizeItemName(item.itemName);
    const existing = deduplicatedMap.get(normalizedName);

    if (!existing || item.totalSpend > existing.totalSpend) {
      deduplicatedMap.set(normalizedName, item);
    }
  });

  const missingItems = Array.from(deduplicatedMap.values())
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const duplicatesRemoved = candidateItems.length - missingItems.length;

  console.log(`❌ Missing Items: ${missingItems.length}`);
  if (duplicatesRemoved > 0) {
    console.log(`   (${duplicatesRemoved} duplicates removed - kept highest spend version)\n`);
  } else {
    console.log('');
  }

  // Show top missing items
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 TOP 30 MISSING ITEMS BY SPEND');
  console.log('═══════════════════════════════════════════════════════\n');

  missingItems.slice(0, 30).forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.itemName}`);
    console.log(`   Vendor SKU: ${item.vendorSku}`);
    console.log(`   Pack: ${item.packSize}`);
    console.log(`   Category: ${item.category}`);
    console.log(`   Type: ${item.type.toUpperCase()}`);
    console.log(`   Spend: $${item.totalSpend.toLocaleString()} (${item.orderCount} orders)\n`);
  });

  if (missingItems.length > 30) {
    console.log(`... and ${missingItems.length - 30} more items\n`);
  }

  // Export to CSV
  const csvLines = ['Vendor SKU,Item Name,Pack Size,Category,Type,Total Spend,Order Count'];
  missingItems.forEach(item => {
    csvLines.push(`"${item.vendorSku}","${item.itemName}","${item.packSize}","${item.category}","${item.type}",${item.totalSpend},${item.orderCount}`);
  });
  fs.writeFileSync('MISSING_ITEMS_TO_IMPORT.csv', csvLines.join('\n'));
  console.log('✅ Missing items exported to: MISSING_ITEMS_TO_IMPORT.csv\n');

  // Import if live mode
  if (!dryRun) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  IMPORTING ITEMS');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get vendors for linking
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, name');

    const vendorMap = new Map<string, string>();
    vendors?.forEach(v => {
      vendorMap.set(v.name.toLowerCase().trim(), v.id);
    });

    console.log(`📦 Vendors in database: ${vendors?.length || 0}\n`);

    let itemsCreated = 0;
    let packsCreated = 0;
    let failed = 0;

    for (const item of missingItems) {
      try {
        // Parse pack size
        const packConfig = parsePackSize(item.packSize);
        const measureType = inferMeasureType(item.category, item.packSize);
        const baseUom = inferBaseUOM(measureType, item.packSize);
        const category = inferCategory(item.category, item.type);

        // Create item
        const { data: newItem, error: itemError } = await supabase
          .from('items')
          .insert({
            organization_id: org.id,
            sku: item.vendorSku,
            name: item.itemName,
            category,
            subcategory: item.subcategory || null,
            base_uom: baseUom,
            r365_measure_type: measureType,
            r365_reporting_uom: baseUom,
            r365_inventory_uom: packConfig.unitSizeUom,
            is_active: true
          })
          .select('id')
          .single();

        if (itemError) {
          console.error(`❌ Failed to create item ${item.vendorSku}: ${itemError.message}`);
          failed++;
          continue;
        }

        itemsCreated++;

        // Look up vendor ID
        const vendorId = item.vendor ? vendorMap.get(item.vendor.toLowerCase().trim()) : null;

        // Create pack configuration
        const { error: packError } = await supabase
          .from('item_pack_configurations')
          .insert({
            item_id: newItem.id,
            pack_type: packConfig.packType,
            units_per_pack: packConfig.unitsPerPack,
            unit_size: packConfig.unitSize,
            unit_size_uom: packConfig.unitSizeUom,
            vendor_id: vendorId || null,
            vendor_item_code: item.vendorSku,
            is_active: true
          });

        if (packError) {
          console.error(`❌ Failed to create pack for ${item.vendorSku}: ${packError.message}`);
        } else {
          packsCreated++;
        }

        if (itemsCreated % 100 === 0) {
          console.log(`  ✅ Created ${itemsCreated} items...`);
        }

      } catch (err: any) {
        console.error(`❌ Error processing ${item.vendorSku}: ${err.message}`);
        failed++;
      }
    }

    console.log(`\n✅ Import complete!`);
    console.log(`   Items created: ${itemsCreated}`);
    console.log(`   Pack configs created: ${packsCreated}`);
    console.log(`   Failed: ${failed}\n`);

    const totalSpend = missingItems.reduce((sum, item) => sum + item.totalSpend, 0);
    console.log(`💰 Annual spend now covered: $${totalSpend.toLocaleString()}\n`);

  } else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE - No changes made');
    console.log('═══════════════════════════════════════════════════════\n');

    const totalSpend = missingItems.reduce((sum, item) => sum + item.totalSpend, 0);

    console.log('📊 Summary:');
    console.log(`   Missing items: ${missingItems.length}`);
    console.log(`   Total annual spend: $${totalSpend.toLocaleString()}\n`);

    console.log('To import these items, run:');
    console.log('  npx tsx scripts/import-missing-items-from-purchase-logs.ts --live\n');

    console.log('This will:');
    console.log(`  ✅ Create ${missingItems.length} new items`);
    console.log(`  ✅ Create ${missingItems.length} pack configurations`);
    console.log(`  ✅ Add vendor SKUs for matching`);
    console.log(`  ✅ Cover $${totalSpend.toLocaleString()} in annual spend\n`);
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
importMissingItems(!isLive).catch(console.error);
