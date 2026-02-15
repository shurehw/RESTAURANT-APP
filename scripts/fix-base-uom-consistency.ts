/**
 * Fix Base UOM Consistency for Recipe Conversions
 * Align base_uom with measure_type for R365 recipe compatibility
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixBaseUOMConsistency(dryRun: boolean = true) {
  console.log('🔧 Fixing Base UOM Consistency for Recipe Conversions\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all items
  console.log('Fetching all items...');

  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select('id, sku, name, category, base_uom, r365_measure_type, r365_reporting_uom, r365_inventory_uom')
      .eq('organization_id', org!.id)
      .eq('is_active', true)
      .range(from, from + batchSize - 1);

    if (error || !items || items.length === 0) break;

    allItems = allItems.concat(items);
    from += batchSize;

    if (items.length < batchSize) break;
  }

  console.log(`Total Items: ${allItems.length}\n`);

  // Determine correct base_uom for each item
  const updates: Array<{
    id: string;
    sku: string;
    name: string;
    measureType: string;
    oldBaseUom: string;
    newBaseUom: string;
    reason: string;
  }> = [];

  allItems.forEach(item => {
    const measureType = item.r365_measure_type;
    const currentBaseUom = item.base_uom;
    let correctBaseUom: string | null = null;
    let reason = '';

    if (measureType === 'Each') {
      // Each measure type should have "ea" as base UOM
      if (currentBaseUom !== 'ea') {
        correctBaseUom = 'ea';
        reason = 'Each measure type requires "ea" base UOM for recipe compatibility';
      }
    } else if (measureType === 'Volume') {
      // Volume measure type should have volume UOM (oz, ml, l, gal)
      const validVolumeUoms = ['oz', 'ml', 'l', 'gal', 'qt'];
      if (!validVolumeUoms.includes(currentBaseUom?.toLowerCase())) {
        correctBaseUom = 'oz'; // Default to oz for volume
        reason = 'Volume measure type requires volume UOM (oz, ml, l, gal)';
      }
    } else if (measureType === 'Weight') {
      // Weight measure type should have weight UOM (lb, kg, g, oz)
      const validWeightUoms = ['lb', 'kg', 'g', 'oz'];
      if (!validWeightUoms.includes(currentBaseUom?.toLowerCase())) {
        correctBaseUom = 'lb'; // Default to lb for weight
        reason = 'Weight measure type requires weight UOM (lb, kg, g, oz)';
      }
    }

    if (correctBaseUom) {
      updates.push({
        id: item.id,
        sku: item.sku,
        name: item.name,
        measureType,
        oldBaseUom: currentBaseUom,
        newBaseUom: correctBaseUom,
        reason
      });
    }
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('UPDATE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Items to update: ${updates.length}\n`);

  // Group by measure type
  const byMeasureType = new Map<string, number>();
  updates.forEach(u => {
    byMeasureType.set(u.measureType, (byMeasureType.get(u.measureType) || 0) + 1);
  });

  console.log('Updates by measure type:');
  byMeasureType.forEach((count, type) => {
    console.log(`  ${type}: ${count} items`);
  });
  console.log();

  if (updates.length > 0) {
    console.log('Sample Updates (first 20):');
    updates.slice(0, 20).forEach(u => {
      console.log(`  ${u.sku} - ${u.name}`);
      console.log(`    ${u.measureType}: "${u.oldBaseUom}" → "${u.newBaseUom}"`);
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
        .from('items')
        .update({
          base_uom: update.newBaseUom,
          r365_reporting_uom: update.newBaseUom,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id);

      if (error) {
        console.error(`❌ Failed: ${update.sku} - ${error.message}`);
        failed++;
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`  ✅ Updated ${updated} items...`);
        }
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}\n`);

    console.log('Impact:');
    console.log('  ✅ Recipe conversions will now work correctly');
    console.log('  ✅ Base UOM matches measure type');
    console.log('  ✅ R365 imports will be consistent\n');

  } else if (updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('This will:');
    console.log(`  - Update ${updates.length} items`);
    console.log('  - Fix base_uom to match measure_type');
    console.log('  - Enable correct recipe conversions in R365');
    console.log('  - Update r365_reporting_uom to match\n');

    console.log('Example fixes:');
    console.log('  - Cilantro: base_uom "unit" → "ea" (60 ea per case)');
    console.log('  - Avocado: base_uom "unit" → "ea" (48 ea per case)');
    console.log('  - Recipe: "2 ea cilantro" = 2 bunches ✅\n');

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/fix-base-uom-consistency.ts --live\n');
  } else {
    console.log('✅ All base UOMs are already consistent!\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
fixBaseUOMConsistency(!isLive).catch(console.error);
