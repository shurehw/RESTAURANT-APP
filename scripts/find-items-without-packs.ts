import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findItemsWithoutPacks() {
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);
  const orgId = items?.[0]?.organization_id;

  // Get all items with their pack configs
  const { data: allItems } = await supabase
    .from('items')
    .select('id, name, category, subcategory, base_uom')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(10000);

  const { data: packConfigs } = await supabase
    .from('item_pack_configurations')
    .select('item_id')
    .limit(10000);

  const itemsWithPacks = new Set(packConfigs?.map(p => p.item_id) || []);

  const itemsWithoutPacks = allItems?.filter(item => !itemsWithPacks.has(item.id)) || [];

  console.log(`Items without pack configurations: ${itemsWithoutPacks.length}\n`);

  // Group by category
  const byCategory: Record<string, any[]> = {};
  itemsWithoutPacks.forEach(item => {
    if (!byCategory[item.category]) {
      byCategory[item.category] = [];
    }
    byCategory[item.category].push(item);
  });

  console.log('Breakdown by category:');
  Object.entries(byCategory)
    .sort(([, a], [, b]) => b.length - a.length)
    .forEach(([category, items]) => {
      console.log(`  ${category}: ${items.length}`);
    });
  console.log('');

  // Show samples from each category
  console.log('Sample items by category:\n');
  Object.entries(byCategory).slice(0, 5).forEach(([category, items]) => {
    console.log(`${category.toUpperCase()}:`);
    items.slice(0, 5).forEach(item => {
      console.log(`  - ${item.name} (${item.base_uom})`);
    });
    console.log('');
  });

  // Check if they're all food items
  const foodCategories = ['produce', 'meat', 'seafood', 'dairy', 'bakery', 'grocery', 'food'];
  const foodItems = itemsWithoutPacks.filter(item => foodCategories.includes(item.category));
  const beverageItems = itemsWithoutPacks.filter(item => !foodCategories.includes(item.category));

  console.log(`Food items without packs: ${foodItems.length} (${Math.round(foodItems.length/itemsWithoutPacks.length*100)}%)`);
  console.log(`Beverage items without packs: ${beverageItems.length} (${Math.round(beverageItems.length/itemsWithoutPacks.length*100)}%)`);
}

findItemsWithoutPacks();
