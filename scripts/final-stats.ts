import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function getFinalStats() {
  console.log('\n=== Final Pack Config Statistics ===\n');

  // Get all items
  const { data: items } = await supabase
    .from('items')
    .select('id')
    .eq('is_active', true);

  // Get all pack configs (use count for accurate total)
  const { count: totalConfigs } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true });

  const { data: configs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  const totalItems = items?.length || 0;
  const itemsWithPackConfigs = itemsWithConfigs.size;
  const itemsWithoutPackConfigs = totalItems - itemsWithPackConfigs;
  const coverage = ((itemsWithPackConfigs / totalItems) * 100).toFixed(1);

  console.log(`Total active items: ${totalItems}`);
  console.log(`Total pack configurations: ${totalConfigs}`);
  console.log(`Items WITH pack configs: ${itemsWithPackConfigs}`);
  console.log(`Items WITHOUT pack configs: ${itemsWithoutPackConfigs}`);
  console.log(`\n✅ Overall Coverage: ${coverage}%`);
}

getFinalStats();
