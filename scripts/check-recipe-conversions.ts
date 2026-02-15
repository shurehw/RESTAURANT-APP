/**
 * Check Recipe Conversion Setup
 * Verify conversions work for recipes
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRecipeConversions() {
  console.log('🔍 Checking Recipe Conversion Setup\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Check specific items
  const testItems = [
    'cilantro',
    'avocado',
    'butter',
    'olive oil',
    'wine'
  ];

  for (const searchTerm of testItems) {
    const { data: items } = await supabase
      .from('items')
      .select(`
        sku, name, category, base_uom, r365_measure_type,
        r365_reporting_uom, r365_inventory_uom,
        item_pack_configurations(
          pack_type, units_per_pack, unit_size, unit_size_uom, conversion_factor
        )
      `)
      .eq('organization_id', org!.id)
      .ilike('name', `%${searchTerm}%`)
      .limit(2);

    if (items && items.length > 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${searchTerm.toUpperCase()}`);
      console.log('='.repeat(60));

      items.forEach(item => {
        console.log(`\n${item.sku} - ${item.name}`);
        console.log(`  Category: ${item.category}`);
        console.log(`  Measure Type: ${item.r365_measure_type}`);
        console.log(`  Base UOM: ${item.base_uom}`);
        console.log(`  Reporting UOM: ${item.r365_reporting_uom}`);
        console.log(`  Inventory UOM: ${item.r365_inventory_uom}`);

        const packs = item.item_pack_configurations || [];
        if (packs.length > 0) {
          console.log('\n  Pack Configurations:');
          packs.forEach((pack, idx) => {
            console.log(`    ${idx + 1}. ${pack.pack_type}:`);
            console.log(`       Units Per Pack: ${pack.units_per_pack}`);
            console.log(`       Unit Size: ${pack.unit_size} ${pack.unit_size_uom}`);
            console.log(`       Conversion Factor: ${pack.conversion_factor}`);

            // Explain conversion
            console.log(`\n       → Conversion Explanation:`);
            if (item.r365_measure_type === 'Each') {
              console.log(`         Buy 1 ${pack.pack_type} = ${pack.units_per_pack} eaches`);
              console.log(`         Recipe uses: ${pack.units_per_pack} eaches (e.g., ${pack.units_per_pack} bunches)`);
            } else {
              console.log(`         Buy 1 ${pack.pack_type} = ${pack.conversion_factor} ${item.base_uom}`);
              console.log(`         Recipe uses: ${pack.conversion_factor} ${item.base_uom}`);
            }
          });
        }
      });
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('KEY QUESTION: Recipe Conversion Logic');
  console.log('='.repeat(60));

  console.log(`
For recipes to work in R365, you need:

1. Purchase UOM (how you buy it)
   Example: Cilantro - buy by CASE

2. Base/Inventory UOM (how you track it)
   Example: Cilantro - track by EACH (bunch)

3. Conversion between them
   Example: 1 CASE = 60 EACH (bunches)

4. Recipe UOM (how recipes use it)
   Example: Recipe calls for "2 bunches" = 2 EACH

CURRENT SETUP:
- ✅ Purchase UOM = pack_type (case, each, etc.)
- ✅ Inventory UOM = base_uom (ea, oz, lb)
- ✅ Conversion = conversion_factor or units_per_pack
- ⚠️  Recipe UOM = needs to match base_uom

POTENTIAL ISSUE:
If base_uom = "unit" but recipes use "ea" or "bunch", conversion breaks!

R365 REQUIREMENTS:
- Base UOM must match what recipes use
- For "Each" measure type items → base_uom MUST be "ea"
- For consistency: Cilantro should be:
  * Measure Type: Each
  * Base UOM: ea (NOT "unit")
  * Recipe calls: "2 ea" (meaning 2 bunches)
  * Purchase: 1 case = 60 ea

RECOMMENDATION:
Fix base_uom for "Each" items from "unit" → "ea"
This ensures recipe conversions work correctly in R365.
`);
}

checkRecipeConversions().catch(console.error);
