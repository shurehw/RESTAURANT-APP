/**
 * Update Beverage Items to "Each" Measure Type
 * Changes wine, liquor, beer from Volume to Each (tracked by bottle)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function updateBeverageToEach(dryRun: boolean = true) {
  console.log('🍷 Updating Beverage Items to "Each" Measure Type\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get wine, liquor, beer items
  const { data: beverageItems } = await supabase
    .from('items')
    .select('id, sku, name, category, base_uom, r365_measure_type')
    .eq('organization_id', org!.id)
    .in('category', ['wine', 'liquor', 'beer', 'spirits'])
    .eq('r365_measure_type', 'Volume'); // Only those currently set as Volume

  console.log(`Beverage items currently set as Volume: ${beverageItems?.length || 0}\n`);

  if (beverageItems && beverageItems.length > 0) {
    const byCategory = new Map<string, number>();
    beverageItems.forEach(item => {
      byCategory.set(item.category, (byCategory.get(item.category) || 0) + 1);
    });

    console.log('Breakdown by Category:');
    byCategory.forEach((count, category) => {
      console.log(`  ${category}: ${count} items`);
    });
    console.log();

    console.log('Sample Items (first 10):');
    beverageItems.slice(0, 10).forEach(item => {
      console.log(`  ${item.sku} - ${item.name}`);
      console.log(`    Current: base_uom=${item.base_uom}, measure_type=${item.r365_measure_type}`);
    });
    console.log();

    if (!dryRun) {
      console.log('═══════════════════════════════════════════════════════');
      console.log('⚠️  UPDATING ITEMS');
      console.log('═══════════════════════════════════════════════════════\n');

      let updated = 0;
      let failed = 0;

      for (const item of beverageItems) {
        const { error } = await supabase
          .from('items')
          .update({
            r365_measure_type: 'Each',
            base_uom: 'ea',
            r365_reporting_uom: 'ea',
            r365_inventory_uom: 'ea',
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (error) {
          console.error(`❌ Failed: ${item.sku} - ${error.message}`);
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

      console.log('Changes made:');
      console.log('  - r365_measure_type: Volume → Each');
      console.log('  - base_uom: oz → ea');
      console.log('  - r365_reporting_uom: oz → ea');
      console.log('  - r365_inventory_uom: oz → ea\n');

      console.log('Impact:');
      console.log('  ✅ Wine/liquor/beer now tracked by bottle (ea)');
      console.log('  ✅ Recipes will use bottle count (e.g., "2 ea")');
      console.log('  ✅ R365 vendor items will show correct Each Amt (e.g., 6 bottles)\n');

    } else {
      console.log('═══════════════════════════════════════════════════════');
      console.log('🔍 DRY RUN COMPLETE');
      console.log('═══════════════════════════════════════════════════════\n');

      console.log('This will update:');
      console.log(`  - ${beverageItems.length} beverage items`);
      console.log('  - r365_measure_type: Volume → Each');
      console.log('  - base_uom: oz → ea');
      console.log('  - Tracked by bottle count instead of volume\n');

      console.log('To apply changes, run:');
      console.log('  npx tsx scripts/update-beverage-to-each.ts --live\n');
    }
  } else {
    console.log('No beverage items found with Volume measure type.\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
updateBeverageToEach(!isLive).catch(console.error);
