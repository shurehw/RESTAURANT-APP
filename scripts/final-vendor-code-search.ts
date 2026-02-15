/**
 * Final Deep Search for Vendor Codes
 * Uses fuzzy matching, partial SKU matching, and aggressive normalization
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeForFuzzy(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove ALL special chars and spaces
    .trim();
}

function extractBrand(name: string): string | null {
  // Extract brand names from item names
  const brands = [
    'moet', 'veuve', 'dom perignon', 'hennessy', 'remy martin',
    'patron', 'casamigos', 'clase azul', 'don julio',
    'grey goose', 'belvedere', 'titos', 'absolut',
    'glenlivet', 'macallan', 'johnnie walker', 'chivas',
    'bombay', 'tanqueray', 'hendricks', 'aviation',
    'bacardi', 'captain morgan', 'malibu', 'kraken',
    'aperol', 'campari', 'fernet', 'cynar',
    'cointreau', 'grand marnier', 'st germain', 'chartreuse'
  ];

  const lowerName = name.toLowerCase();
  for (const brand of brands) {
    if (lowerName.includes(brand)) {
      return brand;
    }
  }
  return null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarityScore(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return 1 - distance / maxLength;
}

async function finalVendorCodeSearch(dryRun: boolean = true) {
  console.log('🔍 Final Deep Search for Vendor Codes\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get items classified as INVESTIGATE or UNKNOWN
  const { data: itemsWithoutCodes } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      category,
      item_pack_configurations!inner(
        id,
        vendor_item_code
      )
    `)
    .eq('organization_id', org!.id)
    .is('item_pack_configurations.vendor_item_code', null);

  const targetItems: any[] = [];
  itemsWithoutCodes?.forEach((item: any) => {
    const packs = item.item_pack_configurations || [];
    packs.forEach((pack: any) => {
      if (!pack.vendor_item_code) {
        targetItems.push({
          id: item.id,
          packId: pack.id,
          sku: item.sku,
          name: item.name,
          category: item.category
        });
      }
    });
  });

  console.log(`Items to search: ${targetItems.length}\n`);

  // Read purchase logs
  console.log('Reading purchase logs...');

  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  // Build comprehensive vendor code maps
  interface VendorItem {
    vendorSku: string;
    itemName: string;
    normalizedName: string;
    fuzzyName: string;
  }

  const vendorItems: VendorItem[] = [];

  // Beverage
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 4) continue;
    const vendorSku = row[2] || '';
    const itemName = row[3] || '';
    if (vendorSku && itemName) {
      vendorItems.push({
        vendorSku,
        itemName,
        normalizedName: itemName.toLowerCase().replace(/\s+/g, ' ').trim(),
        fuzzyName: normalizeForFuzzy(itemName)
      });
    }
  }

  // Food
  for (let i = 6; i < foodData.length; i++) {
    const row = foodData[i];
    if (!row || row.length < 4) continue;
    const vendorSku = row[2] || '';
    const itemName = row[3] || '';
    if (vendorSku && itemName) {
      vendorItems.push({
        vendorSku,
        itemName,
        normalizedName: itemName.toLowerCase().replace(/\s+/g, ' ').trim(),
        fuzzyName: normalizeForFuzzy(itemName)
      });
    }
  }

  console.log(`Vendor items in purchase logs: ${vendorItems.length}\n`);

  // Also get all invoice lines with vendor codes
  console.log('Reading invoice lines...');
  const { data: invoiceLines } = await supabase
    .from('invoice_lines')
    .select('id, description, vendor_item_code')
    .not('vendor_item_code', 'is', null)
    .not('description', 'is', null);

  const invoiceVendorItems: VendorItem[] = (invoiceLines || []).map((line: any) => ({
    vendorSku: line.vendor_item_code,
    itemName: line.description,
    normalizedName: line.description.toLowerCase().replace(/\s+/g, ' ').trim(),
    fuzzyName: normalizeForFuzzy(line.description)
  }));

  console.log(`Vendor items in invoice lines: ${invoiceVendorItems.length}\n`);

  // Combine all vendor items
  const allVendorItems = [...vendorItems, ...invoiceVendorItems];
  console.log(`Total vendor items: ${allVendorItems.length}\n`);

  // Matching strategies
  const updates: Array<{
    packId: string;
    itemSku: string;
    itemName: string;
    vendorCode: string;
    matchType: string;
    confidence: number;
  }> = [];

  console.log('Searching with multiple strategies...\n');

  targetItems.forEach((item, idx) => {
    if ((idx + 1) % 100 === 0) {
      console.log(`  Processed ${idx + 1}/${targetItems.length} items...`);
    }

    const itemFuzzy = normalizeForFuzzy(item.name);
    const itemNormalized = item.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const itemBrand = extractBrand(item.name);

    let bestMatch: { vendorSku: string; matchType: string; confidence: number } | null = null;

    // Strategy 1: Exact fuzzy match (no spaces/special chars)
    for (const vendorItem of allVendorItems) {
      if (vendorItem.fuzzyName === itemFuzzy) {
        bestMatch = {
          vendorSku: vendorItem.vendorSku,
          matchType: 'Exact Fuzzy',
          confidence: 1.0
        };
        break;
      }
    }

    // Strategy 2: High similarity match (90%+)
    if (!bestMatch) {
      for (const vendorItem of allVendorItems) {
        const score = similarityScore(itemFuzzy, vendorItem.fuzzyName);
        if (score >= 0.9) {
          if (!bestMatch || score > bestMatch.confidence) {
            bestMatch = {
              vendorSku: vendorItem.vendorSku,
              matchType: 'High Similarity',
              confidence: score
            };
          }
        }
      }
    }

    // Strategy 3: SKU contains item name or vice versa
    if (!bestMatch) {
      for (const vendorItem of allVendorItems) {
        const vendorNormalized = vendorItem.fuzzyName;
        if (
          (itemFuzzy.length > 5 && vendorNormalized.includes(itemFuzzy)) ||
          (vendorNormalized.length > 5 && itemFuzzy.includes(vendorNormalized))
        ) {
          bestMatch = {
            vendorSku: vendorItem.vendorSku,
            matchType: 'Partial Contains',
            confidence: 0.8
          };
          break;
        }
      }
    }

    // Strategy 4: Brand + category match
    if (!bestMatch && itemBrand) {
      for (const vendorItem of allVendorItems) {
        if (vendorItem.normalizedName.includes(itemBrand)) {
          const score = similarityScore(itemFuzzy, vendorItem.fuzzyName);
          if (score >= 0.7) {
            bestMatch = {
              vendorSku: vendorItem.vendorSku,
              matchType: 'Brand Match',
              confidence: score
            };
            break;
          }
        }
      }
    }

    // Strategy 5: Good similarity (80%+)
    if (!bestMatch) {
      for (const vendorItem of allVendorItems) {
        const score = similarityScore(itemFuzzy, vendorItem.fuzzyName);
        if (score >= 0.8) {
          if (!bestMatch || score > bestMatch.confidence) {
            bestMatch = {
              vendorSku: vendorItem.vendorSku,
              matchType: 'Good Similarity',
              confidence: score
            };
          }
        }
      }
    }

    if (bestMatch) {
      updates.push({
        packId: item.packId,
        itemSku: item.sku,
        itemName: item.name,
        vendorCode: bestMatch.vendorSku,
        matchType: bestMatch.matchType,
        confidence: bestMatch.confidence
      });
    }
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('SEARCH RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Items searched: ${targetItems.length}`);
  console.log(`Matches found: ${updates.length}\n`);

  // Group by match type
  const byMatchType = new Map<string, number>();
  updates.forEach(u => {
    byMatchType.set(u.matchType, (byMatchType.get(u.matchType) || 0) + 1);
  });

  console.log('Matches by type:');
  byMatchType.forEach((count, type) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log();

  // Show samples by confidence
  const highConfidence = updates.filter(u => u.confidence >= 0.95);
  const mediumConfidence = updates.filter(u => u.confidence >= 0.8 && u.confidence < 0.95);
  const lowerConfidence = updates.filter(u => u.confidence < 0.8);

  console.log(`High confidence (≥95%): ${highConfidence.length}`);
  console.log(`Medium confidence (80-95%): ${mediumConfidence.length}`);
  console.log(`Lower confidence (<80%): ${lowerConfidence.length}\n`);

  if (highConfidence.length > 0) {
    console.log('Sample High Confidence Matches (first 20):');
    highConfidence.slice(0, 20).forEach(u => {
      console.log(`  ${u.itemSku} - ${u.itemName}`);
      console.log(`    Vendor Code: ${u.vendorCode} | ${u.matchType} (${(u.confidence * 100).toFixed(1)}%)`);
    });
    console.log();
  }

  if (!dryRun && updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  APPLYING UPDATES');
    console.log('═══════════════════════════════════════════════════════\n');

    // Only apply high and medium confidence matches
    const toApply = updates.filter(u => u.confidence >= 0.8);
    console.log(`Applying ${toApply.length} high/medium confidence matches...\n`);

    let updated = 0;
    let failed = 0;

    for (const update of toApply) {
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
        if (updated % 50 === 0) {
          console.log(`  ✅ Updated ${updated} pack configs...`);
        }
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped (low confidence): ${lowerConfidence.length}\n`);

  } else if (updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    const toApply = updates.filter(u => u.confidence >= 0.8);

    console.log('This will update:');
    console.log(`  - ${toApply.length} pack configurations (≥80% confidence)`);
    console.log(`  - ${new Set(toApply.map(u => u.itemSku)).size} unique items`);
    console.log(`  - Skip ${lowerConfidence.length} low confidence matches\n`);

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/final-vendor-code-search.ts --live\n');
  } else {
    console.log('No additional matches found.\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
finalVendorCodeSearch(!isLive).catch(console.error);
