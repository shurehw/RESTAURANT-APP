import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function completeName() {
  console.log('\n=== Complete Name Standardization ===\n');

  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, item_pack_configurations(units_per_pack, unit_size, unit_size_uom)')
    .eq('is_active', true);

  let updated = 0;

  for (const item of items || []) {
    const packConfigs = (item as any).item_pack_configurations || [];

    if (packConfigs.length === 0) continue;

    // Check if name already has a proper unit at the end (including "each")
    const hasProperUnit = /\d+(\.\d+)?(ml|mL|oz|fl\.oz|l|L|gal|lb|kg|g|in|each)$/i.test(item.name);

    if (hasProperUnit) continue;

    // Find best pack config
    let bestConfig = packConfigs.find((pc: any) => pc.units_per_pack === 1);
    if (!bestConfig) {
      bestConfig = packConfigs.reduce((smallest: any, current: any) => {
        const smallestSize = smallest.units_per_pack * smallest.unit_size;
        const currentSize = current.units_per_pack * current.unit_size;
        return currentSize < smallestSize ? current : smallest;
      });
    }

    // Clean name - remove all pack info patterns
    let cleanName = item.name
      .replace(/\s*\(\d+\/.*?\)\s*$/i, '')        // (6/750ml)
      .replace(/\s*\(.*?\/.*?\)\s*$/i, '')        // (1/10L)
      .replace(/\s*\(\d+\/Case\)\s*$/i, '')       // (6/Case)
      .replace(/\s*\(Case\)\s*$/i, '')            // (Case)
      .replace(/\s*\d+(case|pack|quart|qt|lb)\s*$/i, '')  // 1case, 1pack, 1quart
      .trim();

    // Build new standardized name
    const newName = `${cleanName} ${bestConfig.unit_size}${bestConfig.unit_size_uom}`;

    if (newName === item.name) continue;

    const { error } = await supabase
      .from('items')
      .update({ name: newName })
      .eq('id', item.id);

    if (!error) {
      updated++;
      if (updated <= 40) {
        console.log(`✓ ${item.name}`);
        console.log(`  → ${newName}\n`);
      }
    } else {
      console.error(`Error: ${item.name}:`, error.message);
    }
  }

  console.log(`\n✅ Updated ${updated} item names to standard format`);
}

completeName().catch(console.error);
