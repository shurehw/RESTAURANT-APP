import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixItemNames() {
  console.log('\n=== Fixing Item Names ===\n');

  // Get all items with pack configs
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, item_pack_configurations(units_per_pack, unit_size, unit_size_uom)')
    .eq('is_active', true);

  let updated = 0;
  const changes: Array<{ old: string; new: string; reason: string }> = [];

  for (const item of items || []) {
    const packConfigs = (item as any).item_pack_configurations || [];

    if (packConfigs.length === 0) {
      continue;
    }

    let newName = item.name;
    let reason = '';

    // Check if name already has a unit at the end
    const hasUnit = /\d+(\.\d+)?(ml|oz|l|gal|lb|kg|g|fl\.oz|each|in|case|pack|quart|qt)$/i.test(item.name);

    if (!hasUnit) {
      // Find the best pack config to use for the name
      // Prefer single unit (units_per_pack = 1), otherwise use smallest pack
      let bestConfig = packConfigs.find((pc: any) => pc.units_per_pack === 1);

      if (!bestConfig) {
        // Use the config with the smallest total size (units_per_pack * unit_size)
        bestConfig = packConfigs.reduce((smallest: any, current: any) => {
          const smallestSize = smallest.units_per_pack * smallest.unit_size;
          const currentSize = current.units_per_pack * current.unit_size;
          return currentSize < smallestSize ? current : smallest;
        });
      }

      // Remove pack info from name if present
      let cleanName = item.name
        .replace(/\s*\(\d+\/.*?\)\s*$/i, '')
        .replace(/\s*\(case\)\s*$/i, '')
        .replace(/\s*\(.*?\/.*?\)\s*$/i, '')
        .trim();

      // For single unit configs, use the unit directly
      if (bestConfig.units_per_pack === 1) {
        newName = `${cleanName} ${bestConfig.unit_size}${bestConfig.unit_size_uom}`;
        reason = 'Added single unit size';
      } else {
        // For multi-unit packs, derive the single unit size
        newName = `${cleanName} ${bestConfig.unit_size}${bestConfig.unit_size_uom}`;
        reason = 'Derived from smallest pack';
      }
    } else {
      // Name has a unit, but check for duplicates like "1case 1case"
      const duplicatePattern = /(\d+(?:\.\d+)?)(case|pack|quart|qt)\s+\1\2$/i;
      if (duplicatePattern.test(item.name)) {
        newName = item.name.replace(duplicatePattern, '$1$2');
        reason = 'Removed duplicate unit';
      }
    }

    if (newName !== item.name) {
      const { error } = await supabase
        .from('items')
        .update({ name: newName })
        .eq('id', item.id);

      if (!error) {
        updated++;
        changes.push({ old: item.name, new: newName, reason });

        if (updated <= 30) {
          console.log(`✓ ${item.name}`);
          console.log(`  → ${newName} (${reason})\n`);
        }
      }
    }
  }

  console.log(`\n✅ Updated ${updated} item names`);

  if (changes.length > 30) {
    console.log(`\n... and ${changes.length - 30} more changes`);
  }
}

fixItemNames().catch(console.error);
