/**
 * Food Item Specific Analysis
 * Individually determine correct UOM for each food item based on its characteristics
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface FoodItemAnalysis {
  id: string;
  sku: string;
  name: string;
  category: string;
  currentMeasureType: string;
  currentBaseUom: string;
  proposedMeasureType: string;
  proposedBaseUom: string;
  reasoning: string;
  packInfo: string;
  needsReview: boolean;
}

function analyzeFoodItem(item: any): FoodItemAnalysis {
  const name = item.name.toLowerCase();
  const packs = item.item_pack_configurations || [];

  let proposedMeasureType = item.r365_measure_type;
  let proposedBaseUom = item.base_uom;
  let reasoning = '';
  let needsReview = false;

  // Get pack info for context
  const packInfo = packs.length > 0
    ? `${packs[0].pack_type}, ${packs[0].unit_size} ${packs[0].unit_size_uom}, ${packs[0].units_per_pack} per pack`
    : 'No pack config';

  // ANALYZE BY ITEM NAME AND PACK CONFIGURATION

  // Items that should be WEIGHT (lb)
  if (
    // Explicitly sold by pound
    name.includes('1# lb') || name.includes('per lb') || name.includes('/lb') ||
    // Bulk items typically sold by weight
    (name.includes('butter') && !name.includes('cup') && !name.includes('stick')) ||
    (name.includes('cheese') && name.includes('1lb')) ||
    (name.includes('flour') || name.includes('sugar') || name.includes('rice')) ||
    // Meat/protein that's portioned by weight
    (item.category === 'meat' && !name.includes('ct')) ||
    (item.category === 'seafood' && !name.includes('ct') && !name.includes('caviar'))
  ) {
    proposedMeasureType = 'Weight';
    proposedBaseUom = 'lb';
    reasoning = 'Sold by weight - inventory and recipes use lb';
  }
  // Items that should be EACH (ea)
  else if (
    // Count-based items
    name.match(/\d+\s*ct/i) || // Has "CT" in name (60 CT, 48 CT, etc.)
    name.includes('bunch') ||
    name.includes('head') ||
    // Specific produce items counted
    (name.includes('avocado') && !name.includes('lb')) ||
    (name.includes('tomato') && !name.includes('lb')) ||
    (name.includes('lettuce')) ||
    (name.includes('cilantro') && !name.includes('lb')) ||
    (name.includes('celery')) ||
    (name.includes('onion') && (name.includes('ct') || packs.some((p: any) => p.units_per_pack > 1))) ||
    // Pre-portioned/packaged items
    (name.includes('slice') || name.includes('piece') || name.includes('portion'))
  ) {
    proposedMeasureType = 'Each';
    proposedBaseUom = 'ea';
    reasoning = 'Counted by unit - inventory in ea, recipes can use weight via conversion';
  }
  // AMBIGUOUS CASES - Need review
  else if (
    // Items that could be either
    name.includes('carrot') ||
    name.includes('potato') ||
    name.includes('mushroom') ||
    name.includes('pepper') ||
    name.includes('squash')
  ) {
    // Check pack configuration for clues
    if (packs.some((p: any) => p.unit_size_uom?.toLowerCase() === 'lb' || p.unit_size_uom?.toLowerCase() === '#')) {
      proposedMeasureType = 'Weight';
      proposedBaseUom = 'lb';
      reasoning = 'Pack config indicates weight-based (lb) - NEEDS REVIEW';
      needsReview = true;
    } else if (packs.some((p: any) => p.units_per_pack > 1)) {
      proposedMeasureType = 'Each';
      proposedBaseUom = 'ea';
      reasoning = 'Pack config indicates count-based (ea) - NEEDS REVIEW';
      needsReview = true;
    } else {
      proposedMeasureType = item.r365_measure_type;
      proposedBaseUom = item.base_uom;
      reasoning = 'AMBIGUOUS - Cannot determine from name or pack config';
      needsReview = true;
    }
  }
  // Liquids/sauces - VOLUME
  else if (
    name.includes('juice') ||
    name.includes('sauce') ||
    name.includes('syrup') ||
    name.includes('oil') ||
    name.includes('vinegar')
  ) {
    proposedMeasureType = 'Volume';
    proposedBaseUom = 'oz';
    reasoning = 'Liquid - volume-based (oz/gal)';
  }
  // DEFAULT - Keep current if uncertain
  else {
    proposedMeasureType = item.r365_measure_type;
    proposedBaseUom = item.base_uom;
    reasoning = 'No clear indicator - keeping current (REVIEW RECOMMENDED)';
    needsReview = true;
  }

  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    category: item.category,
    currentMeasureType: item.r365_measure_type,
    currentBaseUom: item.base_uom,
    proposedMeasureType,
    proposedBaseUom,
    reasoning,
    packInfo,
    needsReview
  };
}

async function foodItemSpecificAnalysis() {
  console.log('🔍 FOOD ITEM SPECIFIC ANALYSIS\n');
  console.log('Individual assessment of each food item\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all food items
  console.log('Fetching food items...');

  const { data: foodItems } = await supabase
    .from('items')
    .select(`
      id, sku, name, category, base_uom, r365_measure_type,
      item_pack_configurations(
        pack_type, units_per_pack, unit_size, unit_size_uom, conversion_factor
      )
    `)
    .eq('organization_id', org!.id)
    .eq('is_active', true)
    .in('category', ['food', 'produce', 'meat', 'seafood', 'dairy', 'pantry', 'grocery', 'bakery']);

  console.log(`Total food-related items: ${foodItems?.length || 0}\n`);

  // Analyze each item
  const analyses: FoodItemAnalysis[] = [];
  const needsChange: FoodItemAnalysis[] = [];
  const needsReview: FoodItemAnalysis[] = [];

  foodItems?.forEach(item => {
    const analysis = analyzeFoodItem(item);
    analyses.push(analysis);

    // Check if change needed
    if (analysis.currentMeasureType !== analysis.proposedMeasureType ||
        analysis.currentBaseUom !== analysis.proposedBaseUom) {
      if (analysis.needsReview) {
        needsReview.push(analysis);
      } else {
        needsChange.push(analysis);
      }
    } else if (analysis.needsReview) {
      // Even if no change, flag for review
      needsReview.push(analysis);
    }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('ANALYSIS RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total items analyzed: ${analyses.length}`);
  console.log(`Items needing changes: ${needsChange.length}`);
  console.log(`Items needing manual review: ${needsReview.length}\n`);

  // Group by proposed measure type
  const byMeasureType = new Map<string, number>();
  analyses.forEach(a => {
    const key = `${a.proposedMeasureType} (${a.proposedBaseUom})`;
    byMeasureType.set(key, (byMeasureType.get(key) || 0) + 1);
  });

  console.log('Proposed measure types:');
  byMeasureType.forEach((count, type) => {
    console.log(`  ${type}: ${count} items`);
  });
  console.log();

  // Show samples of each category
  console.log('═══════════════════════════════════════════════════════');
  console.log('WEIGHT-BASED ITEMS (First 20)');
  console.log('═══════════════════════════════════════════════════════\n');

  const weightItems = needsChange.filter(a => a.proposedMeasureType === 'Weight');
  weightItems.slice(0, 20).forEach(a => {
    console.log(`${a.sku} - ${a.name}`);
    console.log(`  Current: ${a.currentMeasureType} (${a.currentBaseUom})`);
    console.log(`  Proposed: ${a.proposedMeasureType} (${a.proposedBaseUom})`);
    console.log(`  Reasoning: ${a.reasoning}`);
    console.log(`  Pack: ${a.packInfo}`);
    console.log();
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('COUNT-BASED ITEMS (First 20)');
  console.log('═══════════════════════════════════════════════════════\n');

  const eachItems = needsChange.filter(a => a.proposedMeasureType === 'Each');
  eachItems.slice(0, 20).forEach(a => {
    console.log(`${a.sku} - ${a.name}`);
    console.log(`  Current: ${a.currentMeasureType} (${a.currentBaseUom})`);
    console.log(`  Proposed: ${a.proposedMeasureType} (${a.proposedBaseUom})`);
    console.log(`  Reasoning: ${a.reasoning}`);
    console.log(`  Pack: ${a.packInfo}`);
    console.log();
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('⚠️  ITEMS NEEDING MANUAL REVIEW');
  console.log('═══════════════════════════════════════════════════════\n');

  needsReview.slice(0, 30).forEach(a => {
    console.log(`${a.sku} - ${a.name}`);
    console.log(`  Current: ${a.currentMeasureType} (${a.currentBaseUom})`);
    console.log(`  Proposed: ${a.proposedMeasureType} (${a.proposedBaseUom})`);
    console.log(`  Reasoning: ${a.reasoning}`);
    console.log(`  Pack: ${a.packInfo}`);
    console.log();
  });

  // Export to CSV
  const csvLines = ['SKU,Item Name,Category,Current Measure Type,Current Base UOM,Proposed Measure Type,Proposed Base UOM,Reasoning,Pack Info,Needs Review'];
  analyses.forEach(a => {
    csvLines.push([
      `"${a.sku}"`,
      `"${a.name}"`,
      `"${a.category}"`,
      `"${a.currentMeasureType}"`,
      `"${a.currentBaseUom}"`,
      `"${a.proposedMeasureType}"`,
      `"${a.proposedBaseUom}"`,
      `"${a.reasoning}"`,
      `"${a.packInfo}"`,
      `"${a.needsReview}"`
    ].join(','));
  });

  fs.writeFileSync('FOOD_ITEM_SPECIFIC_ANALYSIS.csv', csvLines.join('\n'));
  console.log('✅ Analysis exported to: FOOD_ITEM_SPECIFIC_ANALYSIS.csv\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('RECOMMENDATION');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('DO NOT apply changes automatically!');
  console.log(`${needsReview.length} items need manual review to determine correct UOM.\n`);
  console.log('Next steps:');
  console.log('1. Review FOOD_ITEM_SPECIFIC_ANALYSIS.csv');
  console.log('2. Verify proposed changes for weight vs count items');
  console.log('3. Manually adjust any ambiguous items');
  console.log('4. Apply changes selectively\n');
}

foodItemSpecificAnalysis().catch(console.error);
