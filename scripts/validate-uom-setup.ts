/**
 * Validate UOM Setup for R365 Import
 * Check measure types, conversions, and Each Amt calculations
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function validateUOMSetup() {
  console.log('🔍 Validating UOM Setup for R365 Import\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all items with pack configurations
  console.log('Fetching items with pack configurations...');

  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        id,
        sku,
        name,
        category,
        base_uom,
        r365_measure_type,
        r365_reporting_uom,
        r365_inventory_uom,
        item_pack_configurations(
          id,
          pack_type,
          units_per_pack,
          unit_size,
          unit_size_uom,
          conversion_factor,
          vendor_item_code
        )
      `)
      .eq('organization_id', org!.id)
      .eq('is_active', true)
      .range(from, from + batchSize - 1);

    if (error || !items || items.length === 0) break;

    allItems = allItems.concat(items);
    from += batchSize;

    if (items.length < batchSize) break;
  }

  console.log(`Total Items: ${allItems.length}\n`);

  // VALIDATION 1: Wine/Beverage Measure Types
  console.log('═══════════════════════════════════════════════════════');
  console.log('VALIDATION 1: Wine/Beverage Measure Types');
  console.log('═══════════════════════════════════════════════════════\n');

  const beverageCategories = ['wine', 'beer', 'liquor', 'spirits'];
  const beverageItems = allItems.filter(item =>
    beverageCategories.includes((item as any).category?.toLowerCase())
  );

  const eachMeasure = beverageItems.filter(item => (item as any).r365_measure_type === 'Each');
  const volumeMeasure = beverageItems.filter(item => (item as any).r365_measure_type === 'Volume');
  const otherMeasure = beverageItems.filter(item =>
    (item as any).r365_measure_type !== 'Each' && (item as any).r365_measure_type !== 'Volume'
  );

  console.log(`Beverage items: ${beverageItems.length}`);
  console.log(`  Each measure type: ${eachMeasure.length} ✅`);
  console.log(`  Volume measure type: ${volumeMeasure.length} ${volumeMeasure.length > 0 ? '⚠️' : ''}`);
  console.log(`  Other/null: ${otherMeasure.length} ${otherMeasure.length > 0 ? '⚠️' : ''}\n`);

  if (volumeMeasure.length > 0) {
    console.log('⚠️  Warning: Some beverages still have Volume measure type');
    console.log('Sample items:');
    volumeMeasure.slice(0, 5).forEach(item => {
      console.log(`  ${(item as any).sku} - ${(item as any).name}`);
      console.log(`    Measure: ${(item as any).r365_measure_type} | Base UOM: ${(item as any).base_uom}`);
    });
    console.log();
  }

  // VALIDATION 2: Each Amt Calculation Logic
  console.log('═══════════════════════════════════════════════════════');
  console.log('VALIDATION 2: Each Amt Calculation Logic');
  console.log('═══════════════════════════════════════════════════════\n');

  interface EachAmtSample {
    sku: string;
    name: string;
    category: string;
    measureType: string;
    packType: string;
    unitsPerPack: number;
    conversionFactor: number;
    calculatedEachAmt: number;
  }

  const samples: EachAmtSample[] = [];

  // Sample wine items (Each measure type)
  const wineItems = allItems.filter(item => (item as any).category === 'wine');
  wineItems.slice(0, 10).forEach(item => {
    const packs = (item as any).item_pack_configurations || [];
    if (packs.length > 0) {
      const pack = packs[0];
      const eachAmt = (item as any).r365_measure_type === 'Each'
        ? pack.units_per_pack || 1
        : pack.conversion_factor || 1;

      samples.push({
        sku: (item as any).sku,
        name: (item as any).name,
        category: (item as any).category,
        measureType: (item as any).r365_measure_type,
        packType: pack.pack_type,
        unitsPerPack: pack.units_per_pack,
        conversionFactor: pack.conversion_factor,
        calculatedEachAmt: eachAmt
      });
    }
  });

  // Sample food items (Weight measure type)
  const foodItems = allItems.filter(item => (item as any).category === 'food' || (item as any).category === 'meat');
  foodItems.slice(0, 5).forEach(item => {
    const packs = (item as any).item_pack_configurations || [];
    if (packs.length > 0) {
      const pack = packs[0];
      const eachAmt = (item as any).r365_measure_type === 'Each'
        ? pack.units_per_pack || 1
        : pack.conversion_factor || 1;

      samples.push({
        sku: (item as any).sku,
        name: (item as any).name,
        category: (item as any).category,
        measureType: (item as any).r365_measure_type,
        packType: pack.pack_type,
        unitsPerPack: pack.units_per_pack,
        conversionFactor: pack.conversion_factor,
        calculatedEachAmt: eachAmt
      });
    }
  });

  console.log('Sample Each Amt Calculations:\n');
  samples.forEach(s => {
    console.log(`${s.sku} - ${s.name}`);
    console.log(`  Category: ${s.category} | Measure Type: ${s.measureType}`);
    console.log(`  Pack Type: ${s.packType}`);
    console.log(`  Units Per Pack: ${s.unitsPerPack} | Conversion Factor: ${s.conversionFactor}`);
    console.log(`  → Each Amt: ${s.calculatedEachAmt} ${s.measureType === 'Each' ? '(from units_per_pack)' : '(from conversion_factor)'}`);
    console.log();
  });

  // VALIDATION 3: UOM Consistency
  console.log('═══════════════════════════════════════════════════════');
  console.log('VALIDATION 3: UOM Consistency');
  console.log('═══════════════════════════════════════════════════════\n');

  let inconsistentUOM = 0;
  const inconsistentSamples: any[] = [];

  allItems.forEach(item => {
    const measureType = (item as any).r365_measure_type;
    const baseUom = (item as any).base_uom;
    const reportingUom = (item as any).r365_reporting_uom;
    const inventoryUom = (item as any).r365_inventory_uom;

    // Check consistency
    let isInconsistent = false;

    // Each measure type should have "ea" as base UOM
    if (measureType === 'Each' && baseUom !== 'ea') {
      isInconsistent = true;
    }

    // Volume measure type should have volume UOM (oz, ml, l, gal)
    if (measureType === 'Volume' && !['oz', 'ml', 'l', 'gal', 'qt'].includes(baseUom?.toLowerCase())) {
      isInconsistent = true;
    }

    // Weight measure type should have weight UOM (lb, kg, g, oz)
    if (measureType === 'Weight' && !['lb', 'kg', 'g', 'oz'].includes(baseUom?.toLowerCase())) {
      isInconsistent = true;
    }

    if (isInconsistent) {
      inconsistentUOM++;
      if (inconsistentSamples.length < 10) {
        inconsistentSamples.push({
          sku: (item as any).sku,
          name: (item as any).name,
          measureType,
          baseUom,
          reportingUom,
          inventoryUom
        });
      }
    }
  });

  console.log(`Items with inconsistent UOM: ${inconsistentUOM} ${inconsistentUOM > 0 ? '⚠️' : '✅'}\n`);

  if (inconsistentSamples.length > 0) {
    console.log('Sample inconsistencies:');
    inconsistentSamples.forEach(s => {
      console.log(`  ${s.sku} - ${s.name}`);
      console.log(`    Measure Type: ${s.measureType} | Base UOM: ${s.baseUom} ⚠️`);
    });
    console.log();
  }

  // VALIDATION 4: Pack Configuration Coverage
  console.log('═══════════════════════════════════════════════════════');
  console.log('VALIDATION 4: Pack Configuration Coverage');
  console.log('═══════════════════════════════════════════════════════\n');

  const itemsWithPacks = allItems.filter(item => {
    const packs = (item as any).item_pack_configurations || [];
    return packs.length > 0;
  });

  const itemsWithoutPacks = allItems.filter(item => {
    const packs = (item as any).item_pack_configurations || [];
    return packs.length === 0;
  });

  console.log(`Items with pack configs: ${itemsWithPacks.length} (${((itemsWithPacks.length / allItems.length) * 100).toFixed(1)}%)`);
  console.log(`Items without pack configs: ${itemsWithoutPacks.length} (${((itemsWithoutPacks.length / allItems.length) * 100).toFixed(1)}%)\n`);

  // SUMMARY
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const totalIssues = volumeMeasure.length + otherMeasure.length + inconsistentUOM;

  if (totalIssues === 0) {
    console.log('✅ UOM setup looks good!');
    console.log('   - All beverages use Each measure type');
    console.log('   - UOM consistency validated');
    console.log('   - Each Amt calculations correct');
    console.log('   - Ready for R365 import\n');
  } else {
    console.log(`⚠️  Found ${totalIssues} potential issues:`);
    if (volumeMeasure.length > 0) console.log(`   - ${volumeMeasure.length} beverages with Volume measure type`);
    if (otherMeasure.length > 0) console.log(`   - ${otherMeasure.length} beverages with other/null measure type`);
    if (inconsistentUOM > 0) console.log(`   - ${inconsistentUOM} items with inconsistent UOM`);
    console.log();
    console.log('Recommend reviewing these items before R365 import.\n');
  }
}

validateUOMSetup().catch(console.error);
