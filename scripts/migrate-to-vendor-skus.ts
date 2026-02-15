/**
 * Migrate to Vendor SKUs
 * Replace internal SKUs (IT*, FD*, WN*) with vendor SKUs from purchase logs
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface SKUMapping {
  itemId: string;
  oldSku: string;
  newSku: string;
  itemName: string;
  matchType: 'exact_name' | 'partial_name' | 'no_match';
  confidence: number;
}

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

async function migrateToVendorSkus(dryRun: boolean = true) {
  console.log('🔄 Migrating to Vendor SKUs\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '⚠️  LIVE MODE (will modify database)'}\n`);

  // Read purchase logs
  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  // Parse all purchases
  const vendorItemMap = new Map<string, { sku: string; item: string }>();

  // Beverage
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 4) continue;
    const sku = row[2] || '';
    const item = row[3] || '';
    if (sku && item) {
      const normalized = normalizeItemName(item);
      if (!vendorItemMap.has(normalized)) {
        vendorItemMap.set(normalized, { sku, item });
      }
    }
  }

  // Food
  for (let i = 6; i < foodData.length; i++) {
    const row = foodData[i];
    if (!row || row.length < 4) continue;
    const sku = row[2] || '';
    const item = row[3] || '';
    if (sku && item) {
      const normalized = normalizeItemName(item);
      if (!vendorItemMap.has(normalized)) {
        vendorItemMap.set(normalized, { sku, item });
      }
    }
  }

  console.log(`📦 Vendor Items from Purchase Logs: ${vendorItemMap.size}\n`);

  // Get all database items
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, sku, name, is_active');

  if (!dbItems) {
    console.error('❌ Failed to fetch database items');
    return;
  }

  console.log(`📊 Database Items: ${dbItems.length}\n`);

  // Create mappings
  const mappings: SKUMapping[] = [];
  const noMatch: any[] = [];
  const conflicts = new Map<string, string[]>(); // new SKU → multiple old SKUs

  for (const dbItem of dbItems) {
    const normalizedName = normalizeItemName(dbItem.name);
    const vendorItem = vendorItemMap.get(normalizedName);

    if (vendorItem) {
      // Found match
      mappings.push({
        itemId: dbItem.id,
        oldSku: dbItem.sku,
        newSku: vendorItem.sku,
        itemName: dbItem.name,
        matchType: 'exact_name',
        confidence: 100
      });

      // Check for conflicts (multiple items mapping to same vendor SKU)
      if (!conflicts.has(vendorItem.sku)) {
        conflicts.set(vendorItem.sku, []);
      }
      conflicts.get(vendorItem.sku)!.push(dbItem.sku);

    } else {
      noMatch.push({
        id: dbItem.id,
        sku: dbItem.sku,
        name: dbItem.name,
        active: dbItem.is_active
      });
    }
  }

  // Find actual conflicts (vendor SKU used by multiple items)
  const actualConflicts = Array.from(conflicts.entries())
    .filter(([_, oldSkus]) => oldSkus.length > 1);

  // Results
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 MIGRATION ANALYSIS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`✅ Items with vendor SKU mapping: ${mappings.length}`);
  console.log(`⚠️  Items without vendor SKU: ${noMatch.length}`);
  console.log(`🔴 SKU conflicts: ${actualConflicts.length}\n`);

  // Show sample mappings
  if (mappings.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SAMPLE MAPPINGS (First 20)');
    console.log('═══════════════════════════════════════════════════════\n');

    mappings.slice(0, 20).forEach(m => {
      console.log(`${m.oldSku} → ${m.newSku}`);
      console.log(`  ${m.itemName}\n`);
    });
  }

  // Show conflicts
  if (actualConflicts.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔴 CONFLICTS - Multiple items map to same vendor SKU');
    console.log('═══════════════════════════════════════════════════════\n');

    actualConflicts.slice(0, 10).forEach(([vendorSku, oldSkus]) => {
      console.log(`Vendor SKU: ${vendorSku}`);
      console.log(`  Conflicts with: ${oldSkus.join(', ')}`);
      console.log(`  ⚠️  Cannot migrate - manual resolution needed\n`);
    });

    if (actualConflicts.length > 10) {
      console.log(`... and ${actualConflicts.length - 10} more conflicts\n`);
    }
  }

  // Show no-match items
  if (noMatch.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  ITEMS WITHOUT VENDOR SKU (First 20)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('These will keep their current SKUs\n');

    noMatch.slice(0, 20).forEach(item => {
      console.log(`${item.sku} - ${item.name}`);
    });

    if (noMatch.length > 20) {
      console.log(`\n... and ${noMatch.length - 20} more\n`);
    }
  }

  // Export mappings to CSV for review
  const csvLines = ['Old SKU,New SKU,Item Name,Match Type'];
  mappings.forEach(m => {
    csvLines.push(`"${m.oldSku}","${m.newSku}","${m.itemName}","${m.matchType}"`);
  });
  fs.writeFileSync('SKU_MIGRATION_MAPPINGS.csv', csvLines.join('\n'));
  console.log('✅ Mappings exported to: SKU_MIGRATION_MAPPINGS.csv\n');

  // Perform migration if not dry run
  if (!dryRun) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  PERFORMING MIGRATION');
    console.log('═══════════════════════════════════════════════════════\n');

    // Filter out conflicts
    const conflictSkus = new Set(actualConflicts.map(([sku]) => sku));
    const safeToMigrate = mappings.filter(m => !conflictSkus.has(m.newSku));

    console.log(`Migrating ${safeToMigrate.length} items (${mappings.length - safeToMigrate.length} skipped due to conflicts)\n`);

    let migrated = 0;
    let failed = 0;

    for (const mapping of safeToMigrate) {
      const { error } = await supabase
        .from('items')
        .update({
          sku: mapping.newSku,
          updated_at: new Date().toISOString()
        })
        .eq('id', mapping.itemId);

      if (error) {
        console.error(`❌ Failed to update ${mapping.oldSku}: ${error.message}`);
        failed++;
      } else {
        migrated++;
        if (migrated % 100 === 0) {
          console.log(`  ✅ Migrated ${migrated} items...`);
        }
      }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migrated}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped (conflicts): ${mappings.length - safeToMigrate.length}`);
    console.log(`   No vendor SKU: ${noMatch.length}\n`);

  } else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE - No changes made');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('To perform actual migration, run:');
    console.log('  npx tsx scripts/migrate-to-vendor-skus.ts --live\n');

    console.log('⚠️  Before migrating:');
    console.log('  1. Review SKU_MIGRATION_MAPPINGS.csv');
    console.log('  2. Resolve conflicts manually if needed');
    console.log('  3. Backup your database');
    console.log('  4. Run with --live flag\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
migrateToVendorSkus(!isLive).catch(console.error);
