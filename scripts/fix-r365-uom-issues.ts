/**
 * Fix R365 UOM Issues
 * Automatically corrects common UOM configuration problems
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixUOMIssues() {
  console.log('🔧 Fixing R365 UOM Configuration Issues\n');

  const fixes: Array<{ description: string; count: number }> = [];

  // Fix 1: Wine to Volume
  console.log('1️⃣  Setting wine items to Volume measure type...');
  const { data: wineFixed, error: wineError } = await supabase
    .from('items')
    .update({
      r365_measure_type: 'Volume',
      r365_reporting_uom: 'oz',
      r365_inventory_uom: 'oz'
    })
    .eq('category', 'wine')
    .neq('r365_measure_type', 'Volume')
    .eq('is_active', true)
    .select('id');

  if (wineError) {
    console.error('   ❌ Error:', wineError.message);
  } else {
    const count = wineFixed?.length || 0;
    fixes.push({ description: 'Wine items → Volume', count });
    console.log(`   ✅ Fixed ${count} wine items\n`);
  }

  // Fix 2: Beer to Volume
  console.log('2️⃣  Setting beer items to Volume measure type...');
  const { data: beerFixed, error: beerError } = await supabase
    .from('items')
    .update({
      r365_measure_type: 'Volume',
      r365_reporting_uom: 'oz',
      r365_inventory_uom: 'oz'
    })
    .eq('category', 'beer')
    .neq('r365_measure_type', 'Volume')
    .eq('is_active', true)
    .select('id');

  if (beerError) {
    console.error('   ❌ Error:', beerError.message);
  } else {
    const count = beerFixed?.length || 0;
    fixes.push({ description: 'Beer items → Volume', count });
    console.log(`   ✅ Fixed ${count} beer items\n`);
  }

  // Fix 3: Liquor/Spirits to Volume
  console.log('3️⃣  Setting liquor/spirits items to Volume measure type...');
  const { data: liquorFixed, error: liquorError } = await supabase
    .from('items')
    .update({
      r365_measure_type: 'Volume',
      r365_reporting_uom: 'oz',
      r365_inventory_uom: 'oz'
    })
    .in('category', ['liquor', 'spirits'])
    .neq('r365_measure_type', 'Volume')
    .eq('is_active', true)
    .select('id');

  if (liquorError) {
    console.error('   ❌ Error:', liquorError.message);
  } else {
    const count = liquorFixed?.length || 0;
    fixes.push({ description: 'Liquor/Spirits → Volume', count });
    console.log(`   ✅ Fixed ${count} liquor/spirits items\n`);
  }

  // Fix 4: "Each" items with volume pack configs → Volume
  console.log('4️⃣  Converting "Each" items with volume packs to Volume...');
  const { data: itemsWithVolumePacks } = await supabase
    .from('item_pack_configurations')
    .select('item_id')
    .in('unit_size_uom', ['mL', 'L', 'oz', 'gal', 'qt', 'pt', 'fl oz']);

  if (itemsWithVolumePacks && itemsWithVolumePacks.length > 0) {
    const itemIds = [...new Set(itemsWithVolumePacks.map(p => p.item_id))];

    const { data: volumeConverted, error: volumeError } = await supabase
      .from('items')
      .update({
        r365_measure_type: 'Volume',
        r365_reporting_uom: 'oz',
        r365_inventory_uom: 'oz',
        base_uom: 'oz'
      })
      .in('id', itemIds)
      .eq('r365_measure_type', 'Each')
      .eq('is_active', true)
      .select('id');

    if (volumeError) {
      console.error('   ❌ Error:', volumeError.message);
    } else {
      const count = volumeConverted?.length || 0;
      fixes.push({ description: 'Each → Volume (volume packs)', count });
      console.log(`   ✅ Converted ${count} items to Volume\n`);
    }
  }

  // Fix 5: "Each" items with weight pack configs → Weight
  console.log('5️⃣  Converting "Each" items with weight packs to Weight...');
  const { data: itemsWithWeightPacks } = await supabase
    .from('item_pack_configurations')
    .select('item_id')
    .in('unit_size_uom', ['lb', 'kg', 'g']);

  if (itemsWithWeightPacks && itemsWithWeightPacks.length > 0) {
    const itemIds = [...new Set(itemsWithWeightPacks.map(p => p.item_id))];

    const { data: weightConverted, error: weightError } = await supabase
      .from('items')
      .update({
        r365_measure_type: 'Weight',
        r365_reporting_uom: 'oz',
        r365_inventory_uom: 'lb',
        base_uom: 'oz'
      })
      .in('id', itemIds)
      .eq('r365_measure_type', 'Each')
      .eq('is_active', true)
      .select('id');

    if (weightError) {
      console.error('   ❌ Error:', weightError.message);
    } else {
      const count = weightConverted?.length || 0;
      fixes.push({ description: 'Each → Weight (weight packs)', count });
      console.log(`   ✅ Converted ${count} items to Weight\n`);
    }
  }

  // Fix 6: Recalculate conversion factors
  console.log('6️⃣  Recalculating conversion factors...');

  // Fetch all pack configs
  const { data: allPacks } = await supabase
    .from('item_pack_configurations')
    .select('id, item_id, units_per_pack, unit_size, unit_size_uom')
    .limit(10000);

  if (allPacks && allPacks.length > 0) {
    // Fetch items to get base_uom
    const itemIds = [...new Set(allPacks.map(p => p.item_id))];
    const { data: items } = await supabase
      .from('items')
      .select('id, base_uom')
      .in('id', itemIds);

    if (items) {
      const itemMap = new Map(items.map(i => [i.id, i.base_uom]));

      let recalculated = 0;
      for (const pack of allPacks) {
        const baseUom = itemMap.get(pack.item_id);
        if (!baseUom) continue;

        // Call the conversion function
        const { data: newFactor } = await supabase
          .rpc('calculate_pack_conversion_factor', {
            p_units_per_pack: pack.units_per_pack,
            p_unit_size: pack.unit_size,
            p_unit_size_uom: pack.unit_size_uom,
            p_base_uom: baseUom
          });

        if (newFactor) {
          await supabase
            .from('item_pack_configurations')
            .update({ conversion_factor: newFactor })
            .eq('id', pack.id);
          recalculated++;
        }
      }

      fixes.push({ description: 'Conversion factors recalculated', count: recalculated });
      console.log(`   ✅ Recalculated ${recalculated} conversion factors\n`);
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 FIX SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  let totalFixed = 0;
  for (const fix of fixes) {
    console.log(`✅ ${fix.description}: ${fix.count} items`);
    totalFixed += fix.count;
  }

  console.log(`\n🎉 Total items updated: ${totalFixed}\n`);

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('1. ✅ Run validation again:');
  console.log('   npx tsx scripts/validate-r365-uom-conversions.ts\n');

  console.log('2. ✅ Regenerate export files:');
  console.log('   npx tsx scripts/generate-r365-uom-guide.ts\n');

  console.log('3. ✅ Import updated CSV to R365\n');
}

fixUOMIssues().catch(console.error);
