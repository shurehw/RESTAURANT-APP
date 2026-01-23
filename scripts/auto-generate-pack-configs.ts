import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function autoGeneratePackConfigs() {
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);
  const orgId = items?.[0]?.organization_id;

  // Get beverage items without pack configs
  const { data: allItems } = await supabase
    .from('items')
    .select('id, name, category, base_uom')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .in('category', ['liquor', 'wine', 'beer', 'bar_consumables'])
    .limit(10000);

  const { data: existingPacks } = await supabase
    .from('item_pack_configurations')
    .select('item_id')
    .limit(10000);

  const itemsWithPacks = new Set(existingPacks?.map(p => p.item_id) || []);
  const itemsNeedingPacks = allItems?.filter(item => !itemsWithPacks.has(item.id)) || [];

  console.log(`Beverage items needing pack configs: ${itemsNeedingPacks.length}\n`);

  // Parse pack info from item name
  function parsePackFromName(name: string, baseUom: string): { pack_type: string; units_per_pack: number; unit_size: number; unit_size_uom: string } | null {
    const lower = name.toLowerCase();

    // Look for patterns like "6/750ml", "12/750ml", "750ml", "1L", "1.75L"
    const packPatterns = [
      /(\d+)\/(\d+\.?\d*)\s*(ml|l|oz|gal)/i,  // 6/750ml, 12/1L
      /(\d+\.?\d*)\s*(ml|l|oz|gal)/i,          // 750ml, 1.75L
      /(\d+)pk/i,                               // 6pk, 12pk
    ];

    for (const pattern of packPatterns) {
      const match = name.match(pattern);
      if (match) {
        if (match.length === 4) {
          // 6/750ml format
          return {
            pack_type: 'case',
            units_per_pack: parseInt(match[1]),
            unit_size: parseFloat(match[2]),
            unit_size_uom: match[3].toUpperCase()
          };
        } else if (match.length === 3) {
          // 750ml format (single bottle)
          return {
            pack_type: 'bottle',
            units_per_pack: 1,
            unit_size: parseFloat(match[1]),
            unit_size_uom: match[2].toUpperCase()
          };
        }
      }
    }

    // Default for beverages: assume 750ml bottle
    if (baseUom.toLowerCase().includes('oz') || baseUom.toLowerCase().includes('ml') || baseUom.toLowerCase().includes('l')) {
      return {
        pack_type: 'bottle',
        units_per_pack: 1,
        unit_size: 750,
        unit_size_uom: 'ML'
      };
    }

    return null;
  }

  const packConfigsToInsert: any[] = [];

  itemsNeedingPacks.forEach(item => {
    const packConfig = parsePackFromName(item.name, item.base_uom);
    if (packConfig) {
      packConfigsToInsert.push({
        item_id: item.id,
        ...packConfig
      });
    }
  });

  console.log(`Generated ${packConfigsToInsert.length} pack configurations\n`);

  // Show samples
  console.log('Sample pack configs to be created:');
  packConfigsToInsert.slice(0, 10).forEach(config => {
    const item = itemsNeedingPacks.find(i => i.id === config.item_id);
    console.log(`  ${item?.name}`);
    console.log(`    ${config.pack_type}: ${config.units_per_pack} x ${config.unit_size} ${config.unit_size_uom}`);
  });
  console.log('');

  // Insert in batches
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < packConfigsToInsert.length; i += BATCH_SIZE) {
    const batch = packConfigsToInsert.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('item_pack_configurations')
      .insert(batch);

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${batch.length} pack configs (total: ${inserted})`);
    }
  }

  console.log(`\n✅ Created ${inserted} pack configurations`);
}

autoGeneratePackConfigs();
