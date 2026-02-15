/**
 * Deep Dive: Remaining Items Without Vendor Codes
 * Categorize and gameplan for handling items without vendor codes
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ItemAnalysis {
  id: string;
  sku: string;
  name: string;
  category: string;
  created_at: string;
  pack_configs: any[];
  classification: string;
  recommendation: string;
}

function classifyItem(item: any): { classification: string; recommendation: string } {
  const name = item.name.toLowerCase();
  const sku = item.sku.toLowerCase();
  const category = item.category?.toLowerCase() || '';

  // HOUSE-MADE ITEMS (no vendor needed)
  if (
    name.includes('pizza dough') ||
    name.includes('house bread') ||
    name.includes('tomato sauce') ||
    name.includes('cold pressed') ||
    name.includes('fresh squeezed') ||
    sku.includes('houseb') ||
    sku.includes('pizzadough') ||
    sku.includes('tomatosauce')
  ) {
    return {
      classification: 'HOUSE_MADE',
      recommendation: 'KEEP - No vendor code needed (house-made)'
    };
  }

  // CREDITS/ADJUSTMENTS (no vendor needed)
  if (
    name.includes('credit') ||
    name.includes('adjustment') ||
    name.includes('comp') && !category.includes('wine')
  ) {
    return {
      classification: 'ACCOUNTING',
      recommendation: 'KEEP - Accounting entry (no vendor)'
    };
  }

  // GENERIC PLACEHOLDERS (might need vendor or manual entry)
  if (
    name.match(/\(lb\)$/) ||
    name.match(/\(qt\)$/) ||
    name.match(/\(gal\)$/) ||
    name.includes('ice bag') ||
    (name.includes('milk') && name.includes('gal')) ||
    (name.includes('cheese') && name.includes('lb'))
  ) {
    return {
      classification: 'GENERIC_UNIT',
      recommendation: 'REVIEW - Generic unit, might be house-made or need vendor'
    };
  }

  // SPECIALTY WINES (high-end, might be future purchases)
  if (
    (category.includes('wine') || category.includes('liquor') || category.includes('spirits')) &&
    (
      name.match(/\d{4}/) || // Has vintage year
      name.includes('chateau') ||
      name.includes('domaine') ||
      name.includes('gaja') ||
      name.includes('penfolds') ||
      name.includes('brunello') ||
      name.includes('barolo') ||
      name.includes('barbaresco') ||
      parseInt(sku.match(/\d+/)?.[0] || '0') > 100000 // High SKU number (often specialty)
    )
  ) {
    return {
      classification: 'SPECIALTY_BEVERAGE',
      recommendation: 'KEEP - Specialty item, may be purchased later'
    };
  }

  // BAR CONSUMABLES (might be generic or house items)
  if (category.includes('bar_consumables') || category.includes('packaging')) {
    return {
      classification: 'BAR_CONSUMABLES',
      recommendation: 'REVIEW - Bar supplies, check if house or vendor'
    };
  }

  // SEAFOOD/MEAT SPECIALTY (might be spot purchases)
  if (
    (category.includes('seafood') || category.includes('meat')) &&
    (name.includes('caviar') || name.includes('wagyu') || name.includes('oyster'))
  ) {
    return {
      classification: 'SPECIALTY_PROTEIN',
      recommendation: 'KEEP - High-end protein, might be spot market'
    };
  }

  // PRODUCE/GROCERY (standard items - should have vendor)
  if (
    category.includes('produce') ||
    category.includes('grocery') ||
    category.includes('dairy') ||
    category.includes('bakery')
  ) {
    return {
      classification: 'STANDARD_INVENTORY',
      recommendation: 'INVESTIGATE - Should have vendor, check if imported correctly'
    };
  }

  // DEFAULT: Needs investigation
  return {
    classification: 'UNKNOWN',
    recommendation: 'INVESTIGATE - Unclear if should have vendor code'
  };
}

async function deepDiveRemainingItems() {
  console.log('🔍 Deep Dive: Remaining Items Without Vendor Codes\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get items WITHOUT vendor codes
  const { data: itemsWithoutCodes } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      category,
      subcategory,
      created_at,
      updated_at,
      is_active,
      item_pack_configurations!inner(
        id,
        vendor_id,
        vendor_item_code,
        pack_type,
        vendor:vendors(name)
      )
    `)
    .eq('organization_id', org!.id)
    .is('item_pack_configurations.vendor_item_code', null);

  const uniqueItems = new Map<string, any>();
  itemsWithoutCodes?.forEach((item: any) => {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, {
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        subcategory: item.subcategory,
        created_at: item.created_at,
        updated_at: item.updated_at,
        is_active: item.is_active,
        pack_configs: item.item_pack_configurations || []
      });
    }
  });

  console.log(`Total items without vendor codes: ${uniqueItems.size}\n`);

  // Classify all items
  const classified: ItemAnalysis[] = [];
  const byClassification = new Map<string, number>();

  uniqueItems.forEach((item) => {
    const { classification, recommendation } = classifyItem(item);

    classified.push({
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      created_at: item.created_at,
      pack_configs: item.pack_configs,
      classification,
      recommendation
    });

    byClassification.set(classification, (byClassification.get(classification) || 0) + 1);
  });

  // Sort by classification
  classified.sort((a, b) => a.classification.localeCompare(b.classification));

  console.log('═══════════════════════════════════════════════════════');
  console.log('CLASSIFICATION SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  Array.from(byClassification.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([classification, count]) => {
      const pct = ((count / uniqueItems.size) * 100).toFixed(1);
      console.log(`${classification}: ${count} items (${pct}%)`);
    });
  console.log();

  // Show samples by classification
  console.log('═══════════════════════════════════════════════════════');
  console.log('SAMPLES BY CLASSIFICATION');
  console.log('═══════════════════════════════════════════════════════\n');

  const classifications = Array.from(new Set(classified.map(i => i.classification)));

  classifications.forEach(classification => {
    const items = classified.filter(i => i.classification === classification);
    console.log(`\n${classification} (${items.length} items):`);
    console.log('─'.repeat(60));

    items.slice(0, 10).forEach(item => {
      console.log(`  ${item.sku} - ${item.name}`);
      console.log(`    Category: ${item.category}`);
      console.log(`    Recommendation: ${item.recommendation}`);
    });

    if (items.length > 10) {
      console.log(`  ... and ${items.length - 10} more`);
    }
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('GAMEPLAN & RECOMMENDATIONS');
  console.log('═══════════════════════════════════════════════════════\n');

  // Count by recommendation
  const byRecommendation = new Map<string, number>();
  classified.forEach(item => {
    const action = item.recommendation.split(' - ')[0];
    byRecommendation.set(action, (byRecommendation.get(action) || 0) + 1);
  });

  const keepCount = byRecommendation.get('KEEP') || 0;
  const reviewCount = byRecommendation.get('REVIEW') || 0;
  const investigateCount = byRecommendation.get('INVESTIGATE') || 0;

  console.log('Action Items:\n');

  console.log(`1. KEEP (${keepCount} items)`);
  console.log('   ✅ These are correct without vendor codes');
  console.log('   ✅ House-made, accounting entries, specialty items');
  console.log('   → No action needed\n');

  console.log(`2. REVIEW (${reviewCount} items)`);
  console.log('   ⚠️  Generic units and bar consumables');
  console.log('   ⚠️  Need manual review to determine if house-made or vendor');
  console.log('   → Export list for manual review\n');

  console.log(`3. INVESTIGATE (${investigateCount} items)`);
  console.log('   🔍 Standard inventory items that should have vendors');
  console.log('   🔍 Check if vendor codes exist but weren\'t matched');
  console.log('   → Deep search in purchase logs and invoices\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. Export classification list to CSV');
  console.log('2. Manual review of REVIEW items');
  console.log('3. Deep search for INVESTIGATE items');
  console.log('4. Mark truly unused items as inactive after 30 days\n');

  // Export to CSV
  const csvLines = ['SKU,Item Name,Category,Classification,Recommendation,Created Date'];
  classified.forEach(item => {
    csvLines.push([
      `"${item.sku}"`,
      `"${item.name}"`,
      `"${item.category}"`,
      `"${item.classification}"`,
      `"${item.recommendation}"`,
      `"${item.created_at.split('T')[0]}"`
    ].join(','));
  });

  fs.writeFileSync('ITEMS_WITHOUT_VENDOR_CODES_ANALYSIS.csv', csvLines.join('\n'));
  console.log('✅ Analysis exported to: ITEMS_WITHOUT_VENDOR_CODES_ANALYSIS.csv\n');

  // Summary stats
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const correctWithoutVendor = keepCount;
  const needsReview = reviewCount;
  const possibleMissing = investigateCount;

  console.log(`📊 Total items: ${uniqueItems.size}`);
  console.log(`✅ Correct without vendor: ${correctWithoutVendor} (${((correctWithoutVendor / uniqueItems.size) * 100).toFixed(1)}%)`);
  console.log(`⚠️  Needs review: ${needsReview} (${((needsReview / uniqueItems.size) * 100).toFixed(1)}%)`);
  console.log(`🔍 Possibly missing vendor: ${possibleMissing} (${((possibleMissing / uniqueItems.size) * 100).toFixed(1)}%)\n`);

  console.log('Effective vendor coverage (excluding correct no-vendor items):');
  const shouldHaveVendor = uniqueItems.size - correctWithoutVendor;
  const actualCoverage = ((3909 / (3909 + shouldHaveVendor)) * 100).toFixed(1);
  console.log(`  ${actualCoverage}% of items that SHOULD have vendor codes DO have them\n`);
}

deepDiveRemainingItems().catch(console.error);
