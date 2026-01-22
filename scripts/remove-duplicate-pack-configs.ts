import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function removeDuplicates() {
  console.log('\n=== Removing Duplicate Pack Configs ===\n');

  // Fetch all pack configs (Supabase has a default limit, so we need to fetch all)
  let allConfigs: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: configs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .order('item_id, created_at')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (!configs || configs.length === 0) break;
    allConfigs = allConfigs.concat(configs);
    page++;
    if (configs.length < pageSize) break;
  }

  console.log(`Total pack configs: ${allConfigs.length}`);

  // Group by item_id + pack details to find duplicates
  const seen = new Map<string, any>();
  const duplicates: string[] = [];

  for (const config of allConfigs) {
    // Create a unique key based on pack details
    const key = `${config.item_id}|${config.pack_type}|${config.units_per_pack}|${config.unit_size}|${config.unit_size_uom}`;

    if (seen.has(key)) {
      // This is a duplicate - keep the older one, delete this one
      duplicates.push(config.id);
      console.log(`Duplicate found: ${key.substring(0, 50)}`);
    } else {
      seen.set(key, config);
    }
  }

  console.log(`\nFound ${duplicates.length} duplicate pack configs`);

  if (duplicates.length > 0) {
    console.log('\nDeleting duplicates...');

    // Delete in batches of 100
    for (let i = 0; i < duplicates.length; i += 100) {
      const batch = duplicates.slice(i, i + 100);
      const { error } = await supabase
        .from('item_pack_configurations')
        .delete()
        .in('id', batch);

      if (error) {
        console.error(`Error deleting batch ${i / 100 + 1}:`, error);
      } else {
        console.log(`Deleted batch ${i / 100 + 1} (${batch.length} configs)`);
      }
    }

    console.log(`\n✓ Deleted ${duplicates.length} duplicate pack configs`);
  } else {
    console.log('\n✓ No duplicates found');
  }

  // Final count
  const { count } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true });

  console.log(`\nFinal pack config count: ${count}`);
}

removeDuplicates().catch(console.error);
