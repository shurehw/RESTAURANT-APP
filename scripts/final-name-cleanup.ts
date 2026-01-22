import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalCleanup() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, item_pack_configurations(units_per_pack, unit_size, unit_size_uom)')
    .eq('is_active', true);

  let updated = 0;

  for (const item of items || []) {
    const packConfigs = (item as any).item_pack_configurations || [];

    // Skip if already has unit
    const hasUnit = /\d+(\.\d+)?(ml|mL|oz|fl\.oz|l|L|gal|lb|kg|g|in|each|case|pack|quart|qt)$/i.test(item.name);
    if (hasUnit || packConfigs.length === 0) continue;

    // Extract unit from pack info in name like "(6/750ml)" or "(6/Case)"
    const packInfoMatch = item.name.match(/\((\d+)\/(\d+(?:\.\d+)?)(ml|l|oz|gal|lb|kg|g)\)/i);

    let newName = item.name;

    if (packInfoMatch) {
      // Has "(6/750ml)" format - extract the single unit
      const cleanName = item.name.replace(/\s*\(.*?\)\s*$/, '').trim();
      newName = `${cleanName} ${packInfoMatch[2]}${packInfoMatch[3]}`;
    } else {
      // Use pack config to derive unit
      let bestConfig = packConfigs.find((pc: any) => pc.units_per_pack === 1);
      if (!bestConfig && packConfigs.length > 0) {
        bestConfig = packConfigs.reduce((smallest: any, current: any) => {
          const smallestSize = smallest.units_per_pack * smallest.unit_size;
          const currentSize = current.units_per_pack * current.unit_size;
          return currentSize < smallestSize ? current : smallest;
        });
      }

      if (bestConfig) {
        const cleanName = item.name
          .replace(/\s*\(.*?\)\s*$/i, '')
          .trim();
        newName = `${cleanName} ${bestConfig.unit_size}${bestConfig.unit_size_uom}`;
      }
    }

    if (newName !== item.name) {
      await supabase
        .from('items')
        .update({ name: newName })
        .eq('id', item.id);

      console.log(`✓ ${item.name}`);
      console.log(`  → ${newName}\n`);
      updated++;
    }
  }

  console.log(`\n✅ Updated ${updated} item names`);
}

finalCleanup().catch(console.error);
