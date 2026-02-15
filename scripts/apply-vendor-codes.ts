/**
 * Apply Vendor Codes to Pack Configurations
 * Updates pack configs with vendor codes found from purchase logs
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

async function applyVendorCodes(dryRun: boolean = true) {
  console.log('🔧 Applying Vendor Codes to Pack Configurations\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all pack configs WITHOUT vendor codes
  console.log('Fetching pack configs without vendor codes...');

  const { data: packsWithoutCodes } = await supabase
    .from('item_pack_configurations')
    .select(`
      id,
      item_id,
      vendor_id,
      item:items!inner(
        id,
        sku,
        name,
        organization_id
      )
    `)
    .eq('item.organization_id', org!.id)
    .is('vendor_item_code', null);

  console.log(`Pack configs without vendor codes: ${packsWithoutCodes?.length || 0}\n`);

  // Get unique items
  const uniqueItems = new Map();
  packsWithoutCodes?.forEach(pack => {
    const item = (pack.item as any);
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, {
        id: item.id,
        sku: item.sku,
        name: item.name,
        packConfigs: []
      });
    }
    uniqueItems.get(item.id).packConfigs.push({
      packId: pack.id,
      vendorId: pack.vendor_id
    });
  });

  console.log(`Unique items without vendor codes: ${uniqueItems.size}\n`);

  // Read purchase logs
  console.log('Reading purchase logs...');

  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  // Build vendor item map: item name → vendor SKU
  const vendorItemMap = new Map<string, string>();

  // Beverage
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 4) continue;
    const vendorSku = row[2] || '';
    const itemName = row[3] || '';
    if (vendorSku && itemName) {
      const normalized = normalizeItemName(itemName);
      if (!vendorItemMap.has(normalized)) {
        vendorItemMap.set(normalized, vendorSku);
      }
    }
  }

  // Food
  for (let i = 6; i < foodData.length; i++) {
    const row = foodData[i];
    if (!row || row.length < 4) continue;
    const vendorSku = row[2] || '';
    const itemName = row[3] || '';
    if (vendorSku && itemName) {
      const normalized = normalizeItemName(itemName);
      if (!vendorItemMap.has(normalized)) {
        vendorItemMap.set(normalized, vendorSku);
      }
    }
  }

  console.log(`Vendor items in purchase logs: ${vendorItemMap.size}\n`);

  // Match items and collect updates
  const updates: Array<{ packId: string; vendorSku: string; itemName: string; itemSku: string }> = [];

  uniqueItems.forEach((item) => {
    const normalizedName = normalizeItemName(item.name);
    const vendorSku = vendorItemMap.get(normalizedName);

    if (vendorSku) {
      // Update ALL pack configs for this item with the vendor code
      item.packConfigs.forEach((pack: any) => {
        updates.push({
          packId: pack.packId,
          vendorSku,
          itemName: item.name,
          itemSku: item.sku
        });
      });
    }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('UPDATE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Pack configs to update: ${updates.length}`);
  console.log(`Unique items with vendor codes found: ${new Set(updates.map(u => u.itemSku)).size}\n`);

  if (updates.length > 0) {
    console.log('Sample Updates (first 20):');
    updates.slice(0, 20).forEach(u => {
      console.log(`  ${u.itemSku} - ${u.itemName}`);
      console.log(`    Vendor Code: ${u.vendorSku}`);
    });
    console.log();
  }

  if (!dryRun && updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  APPLYING UPDATES');
    console.log('═══════════════════════════════════════════════════════\n');

    let updated = 0;
    let failed = 0;

    for (const update of updates) {
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({
          vendor_item_code: update.vendorSku,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.packId);

      if (error) {
        console.error(`❌ Failed: ${update.itemSku} - ${error.message}`);
        failed++;
      } else {
        updated++;
        if (updated % 50 === 0) {
          console.log(`  ✅ Updated ${updated} pack configs...`);
        }
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}\n`);

    // Fetch new coverage stats
    const { data: totalPacks } = await supabase
      .from('item_pack_configurations')
      .select('id', { count: 'exact', head: true })
      .eq('item.organization_id', org!.id);

    const { data: packsWithCodes } = await supabase
      .from('item_pack_configurations')
      .select('id', { count: 'exact', head: true })
      .eq('item.organization_id', org!.id)
      .not('vendor_item_code', 'is', null);

    console.log('New Coverage:');
    console.log(`  Total pack configs: ${totalPacks || 0}`);
    console.log(`  With vendor codes: ${packsWithCodes || 0}`);
    console.log(`  Coverage: ${((packsWithCodes || 0) / (totalPacks || 1) * 100).toFixed(1)}%\n`);

  } else if (updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('This will update:');
    console.log(`  - ${updates.length} pack configurations`);
    console.log(`  - ${new Set(updates.map(u => u.itemSku)).size} unique items`);
    console.log(`  - Add vendor_item_code from purchase logs\n`);

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/apply-vendor-codes.ts --live\n');
  } else {
    console.log('No vendor codes to apply.\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
applyVendorCodes(!isLive).catch(console.error);
