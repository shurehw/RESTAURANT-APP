/**
 * Deep Match Analysis
 * Verify matching logic and find potential false negatives
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeSKU(sku: string): string {
  return sku
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Remove all non-alphanumeric
    .trim();
}

async function deepMatchAnalysis() {
  console.log('🔍 Deep Match Analysis - Verifying Match Logic\n');

  // Get all database items
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, sku, name, category, is_active');

  console.log(`Database: ${dbItems?.length || 0} total items`);
  console.log(`Active: ${dbItems?.filter(i => i.is_active).length || 0}`);
  console.log(`Inactive: ${dbItems?.filter(i => !i.is_active).length || 0}\n`);

  // Read both purchase logs
  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  // Parse purchases
  const allPurchases: any[] = [];

  // Beverage purchases (starting at row 6)
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 10) continue;
    allPurchases.push({
      type: 'beverage',
      sku: row[2] || '',
      item: row[3] || '',
      packSize: row[4] || ''
    });
  }

  // Food purchases (starting at row 6)
  for (let i = 6; i < foodData.length; i++) {
    const row = foodData[i];
    if (!row || row.length < 10) continue;
    allPurchases.push({
      type: 'food',
      sku: row[2] || '',
      item: row[3] || '',
      packSize: row[4] || ''
    });
  }

  // Get unique purchase SKUs
  const uniquePurchases = Array.from(
    new Map(allPurchases.map(p => [p.sku, p])).values()
  ).filter(p => p.sku);

  console.log(`Unique SKUs in Purchase Logs: ${uniquePurchases.length}\n`);

  // Build SKU lookup maps
  const dbSkuMap = new Map<string, any>();
  const dbNormalizedSkuMap = new Map<string, any[]>();

  dbItems?.forEach(item => {
    // Exact SKU
    dbSkuMap.set(item.sku, item);

    // Normalized SKU
    const normalized = normalizeSKU(item.sku);
    if (!dbNormalizedSkuMap.has(normalized)) {
      dbNormalizedSkuMap.set(normalized, []);
    }
    dbNormalizedSkuMap.get(normalized)!.push(item);
  });

  // Matching analysis
  let exactMatches = 0;
  let normalizedMatches = 0;
  let noMatches = 0;

  const examples = {
    exact: [] as any[],
    normalized: [] as any[],
    noMatch: [] as any[]
  };

  for (const purchase of uniquePurchases) {
    const exactMatch = dbSkuMap.get(purchase.sku);

    if (exactMatch) {
      exactMatches++;
      if (examples.exact.length < 10) {
        examples.exact.push({
          purchaseSku: purchase.sku,
          purchaseItem: purchase.item,
          dbSku: exactMatch.sku,
          dbItem: exactMatch.name,
          type: purchase.type
        });
      }
    } else {
      const normalizedSku = normalizeSKU(purchase.sku);
      const normalizedMatch = dbNormalizedSkuMap.get(normalizedSku);

      if (normalizedMatch && normalizedMatch.length > 0) {
        normalizedMatches++;
        if (examples.normalized.length < 10) {
          examples.normalized.push({
            purchaseSku: purchase.sku,
            purchaseItem: purchase.item,
            dbSku: normalizedMatch[0].sku,
            dbItem: normalizedMatch[0].name,
            type: purchase.type,
            normalizedSku
          });
        }
      } else {
        noMatches++;
        if (examples.noMatch.length < 20) {
          examples.noMatch.push({
            purchaseSku: purchase.sku,
            purchaseItem: purchase.item,
            packSize: purchase.packSize,
            type: purchase.type
          });
        }
      }
    }
  }

  // Results
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 MATCHING ANALYSIS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`✅ Exact SKU Matches: ${exactMatches}`);
  console.log(`✅ Normalized SKU Matches: ${normalizedMatches}`);
  console.log(`❌ No Matches: ${noMatches}\n`);

  const totalMatches = exactMatches + normalizedMatches;
  const matchRate = ((totalMatches / uniquePurchases.length) * 100).toFixed(1);

  console.log(`Total Match Rate: ${matchRate}%\n`);

  // Show examples
  if (examples.exact.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ EXACT MATCHES (Sample)');
    console.log('═══════════════════════════════════════════════════════\n');

    examples.exact.forEach(ex => {
      console.log(`[${ex.type.toUpperCase()}]`);
      console.log(`  Purchase: "${ex.purchaseSku}" - ${ex.purchaseItem}`);
      console.log(`  Database: "${ex.dbSku}" - ${ex.dbItem}`);
      console.log(`  ✅ EXACT MATCH\n`);
    });
  }

  if (examples.normalized.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ NORMALIZED MATCHES (Sample)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('These match when we ignore dashes, spaces, case\n');

    examples.normalized.forEach(ex => {
      console.log(`[${ex.type.toUpperCase()}]`);
      console.log(`  Purchase: "${ex.purchaseSku}" - ${ex.purchaseItem}`);
      console.log(`  Database: "${ex.dbSku}" - ${ex.dbItem}`);
      console.log(`  Normalized: "${ex.normalizedSku}"`);
      console.log(`  ✅ MATCH (with normalization)\n`);
    });
  }

  if (examples.noMatch.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ NO MATCHES (Sample)');
    console.log('═══════════════════════════════════════════════════════');
    console.log('These truly appear missing from database\n');

    examples.noMatch.forEach(ex => {
      console.log(`[${ex.type.toUpperCase()}]`);
      console.log(`  SKU: "${ex.purchaseSku}"`);
      console.log(`  Item: ${ex.purchaseItem}`);
      console.log(`  Pack: ${ex.packSize}`);
      console.log(`  ❌ NOT FOUND IN DATABASE\n`);
    });
  }

  // Check for potential SKU patterns
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 SKU PATTERN ANALYSIS');
  console.log('═══════════════════════════════════════════════════════\n');

  const dbSkuPatterns = new Map<string, number>();
  dbItems?.forEach(item => {
    const prefix = item.sku.substring(0, 2).toUpperCase();
    dbSkuPatterns.set(prefix, (dbSkuPatterns.get(prefix) || 0) + 1);
  });

  console.log('Database SKU Prefixes:');
  Array.from(dbSkuPatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([prefix, count]) => {
      console.log(`  ${prefix}*: ${count} items`);
    });

  console.log('\n');

  const purchaseSkuPatterns = new Map<string, number>();
  uniquePurchases.forEach(p => {
    if (!p.sku) return;
    const prefix = p.sku.substring(0, 2).toUpperCase();
    purchaseSkuPatterns.set(prefix, (purchaseSkuPatterns.get(prefix) || 0) + 1);
  });

  console.log('Purchase Log SKU Prefixes:');
  Array.from(purchaseSkuPatterns.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([prefix, count]) => {
      console.log(`  ${prefix}*: ${count} items`);
    });

  console.log('\n');

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 CONCLUSION');
  console.log('═══════════════════════════════════════════════════════\n');

  if (matchRate < 50) {
    console.log(`⚠️  Low match rate (${matchRate}%) suggests:`);
    console.log(`   1. Items ARE genuinely missing from database, OR`);
    console.log(`   2. Purchase logs use different SKU scheme than database\n`);

    console.log(`📊 The numbers:`);
    console.log(`   - Database has ${dbItems?.length} items`);
    console.log(`   - Purchase logs show ${uniquePurchases.length} unique SKUs`);
    console.log(`   - Only ${totalMatches} matched (${matchRate}%)\n`);

    console.log(`🎯 Recommendation:`);
    console.log(`   Review the "NO MATCHES" examples above.`);
    console.log(`   Do these items exist in your database with different SKUs?`);
    console.log(`   Or are they truly missing?\n`);
  } else {
    console.log(`✅ Good match rate (${matchRate}%)`);
    console.log(`   Most items are in the database.\n`);
  }
}

deepMatchAnalysis().catch(console.error);
