/**
 * Recover Vendor Codes from Original Import
 * Re-extract vendor codes from purchase logs for items created on Feb 2nd
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

async function recoverVendorCodes(dryRun: boolean = true) {
  console.log('🔧 Recovering Vendor Codes from Purchase Logs\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get items created on Feb 2nd (the import date) without vendor codes
  console.log('Fetching items created during import...');

  const { data: importedItems } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      created_at,
      item_pack_configurations(
        id,
        vendor_item_code
      )
    `)
    .eq('organization_id', org!.id)
    .gte('created_at', '2026-02-01')
    .lte('created_at', '2026-02-03');

  console.log(`Items created during import period: ${importedItems?.length || 0}`);

  // Filter to only those with pack configs that have NO vendor code
  const itemsWithoutCodes: any[] = [];
  importedItems?.forEach((item: any) => {
    const packs = item.item_pack_configurations || [];
    const hasPackWithoutCode = packs.some((p: any) => !p.vendor_item_code);

    if (hasPackWithoutCode) {
      itemsWithoutCodes.push({
        ...item,
        packIds: packs.filter((p: any) => !p.vendor_item_code).map((p: any) => p.id)
      });
    }
  });

  console.log(`Items with pack configs missing vendor codes: ${itemsWithoutCodes.length}\n`);

  // Read purchase logs
  console.log('Reading purchase logs...');

  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  // Build vendor code map: normalized item name → vendor SKU
  const vendorCodeMap = new Map<string, string>();

  // Beverage
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 4) continue;
    const vendorSku = row[2] || '';
    const itemName = row[3] || '';
    if (vendorSku && itemName) {
      const normalized = normalizeItemName(itemName);
      if (!vendorCodeMap.has(normalized)) {
        vendorCodeMap.set(normalized, vendorSku);
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
      if (!vendorCodeMap.has(normalized)) {
        vendorCodeMap.set(normalized, vendorSku);
      }
    }
  }

  console.log(`Vendor codes in purchase logs: ${vendorCodeMap.size}\n`);

  // Match items to vendor codes
  const updates: Array<{
    packId: string;
    itemName: string;
    itemSku: string;
    vendorCode: string;
  }> = [];

  itemsWithoutCodes.forEach((item) => {
    const normalizedName = normalizeItemName(item.name);
    const vendorCode = vendorCodeMap.get(normalizedName);

    if (vendorCode) {
      // Update ALL pack configs for this item
      item.packIds.forEach((packId: string) => {
        updates.push({
          packId,
          itemName: item.name,
          itemSku: item.sku,
          vendorCode
        });
      });
    }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('RECOVERY SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Pack configs to update: ${updates.length}`);
  console.log(`Unique items: ${new Set(updates.map(u => u.itemSku)).size}\n`);

  if (updates.length > 0) {
    console.log('Sample Updates (first 20):');
    updates.slice(0, 20).forEach(u => {
      console.log(`  ${u.itemSku} - ${u.itemName}`);
      console.log(`    Vendor Code: ${u.vendorCode}`);
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
          vendor_item_code: update.vendorCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.packId);

      if (error) {
        console.error(`❌ Failed: ${update.itemSku} - ${error.message}`);
        failed++;
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`  ✅ Updated ${updated} pack configs...`);
        }
      }
    }

    console.log(`\n✅ Recovery complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}\n`);

  } else if (updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('This will update:');
    console.log(`  - ${updates.length} pack configurations`);
    console.log(`  - ${new Set(updates.map(u => u.itemSku)).size} unique items`);
    console.log(`  - Add vendor codes from original purchase logs\n`);

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/recover-vendor-codes-from-import.ts --live\n');
  } else {
    console.log('No vendor codes to recover.\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
recoverVendorCodes(!isLive).catch(console.error);
