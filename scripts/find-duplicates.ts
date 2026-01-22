import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findDuplicates() {
  console.log('\n=== Finding Duplicate Items ===\n');

  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true)
    .order('name');

  // Group by SKU
  const bySku = new Map<string, any[]>();
  for (const item of items || []) {
    if (!item.sku) continue;
    if (!bySku.has(item.sku)) {
      bySku.set(item.sku, []);
    }
    bySku.get(item.sku)!.push(item);
  }

  // Find duplicates
  console.log('Items with duplicate SKUs:\n');
  let dupCount = 0;
  for (const [sku, itemList] of bySku.entries()) {
    if (itemList.length > 1) {
      dupCount++;
      console.log(`SKU ${sku}:`);
      for (const item of itemList) {
        const { data: configs } = await supabase
          .from('item_pack_configurations')
          .select('id')
          .eq('item_id', item.id);
        console.log(`  - ${item.name.substring(0, 50)} (ID: ${item.id.substring(0, 8)}) | ${configs?.length || 0} pack configs`);
      }
      console.log('');
    }
  }

  console.log(`Total SKUs with duplicates: ${dupCount}`);
}

findDuplicates().catch(console.error);
