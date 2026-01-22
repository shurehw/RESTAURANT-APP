import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function standardizeItemNames() {
  console.log('\n=== Standardizing Item Names to Include Single Unit Size ===\n');

  // Get all items
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, item_pack_configurations(units_per_pack, unit_size, unit_size_uom)')
    .eq('is_active', true);

  let updated = 0;
  let skipped = 0;
  const changes: Array<{ old: string; new: string }> = [];

  for (const item of items || []) {
    // Check if name already has a unit at the end
    const hasUnit = /\d+(\.\d+)?(ml|oz|l|gal|lb|kg|g|fl\.oz|each|in)$/i.test(item.name);

    if (hasUnit) {
      skipped++;
      continue;
    }

    // Find the single unit pack config (units_per_pack = 1)
    const singleUnitConfig = (item as any).item_pack_configurations?.find(
      (pc: any) => pc.units_per_pack === 1
    );

    if (!singleUnitConfig) {
      // No single unit config, skip
      console.log(`⏭️  No single unit config: ${item.name}`);
      skipped++;
      continue;
    }

    // Remove pack info from name if present (e.g., "(6/750ml)" or "(6/Case)")
    let cleanName = item.name
      .replace(/\s*\(\d+\/.*?\)\s*$/i, '')  // Remove (6/750ml) or (6/Case)
      .replace(/\s*\(case\)\s*$/i, '')       // Remove (Case)
      .trim();

    // Build new name with single unit size
    const unitSize = singleUnitConfig.unit_size;
    const unitUom = singleUnitConfig.unit_size_uom;
    const newName = `${cleanName} ${unitSize}${unitUom}`;

    if (newName === item.name) {
      skipped++;
      continue;
    }

    // Update the item
    const { error } = await supabase
      .from('items')
      .update({ name: newName })
      .eq('id', item.id);

    if (!error) {
      updated++;
      changes.push({ old: item.name, new: newName });

      if (updated <= 20) {
        console.log(`✓ ${item.name}`);
        console.log(`  → ${newName}\n`);
      }
    } else {
      console.error(`Error updating ${item.name}:`, error.message);
    }
  }

  console.log(`\n✅ Updated ${updated} item names`);
  console.log(`⏭️  Skipped ${skipped} items (already standardized or no single unit config)`);

  if (changes.length > 20) {
    console.log(`\n... and ${changes.length - 20} more changes`);
  }
}

standardizeItemNames().catch(console.error);
