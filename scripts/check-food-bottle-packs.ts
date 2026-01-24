import { createClient } from '@supabase/supabase-js';

async function checkFoodBottlePacks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  // Get all food items
  const { data: foodItems } = await supabase
    .from('items')
    .select('id, name, sku, category')
    .eq('organization_id', orgId)
    .in('category', ['grocery', 'bakery', 'meat', 'seafood', 'dairy', 'produce', 'food'])
    .eq('is_active', true);

  console.log('Total food items:', foodItems?.length);

  // Check for bottle pack configs
  const itemIds = foodItems?.map(i => i.id) || [];

  const { data: bottlePacks } = await supabase
    .from('item_pack_configurations')
    .select('id, item_id, pack_type, units_per_pack')
    .in('item_id', itemIds)
    .eq('pack_type', 'bottle');

  console.log('Food items with "bottle" pack configs:', bottlePacks?.length);

  if (bottlePacks && bottlePacks.length > 0) {
    console.log('\nSample items with bottle packs:');
    const sampleIds = bottlePacks.slice(0, 5).map(p => p.item_id);
    const { data: sampleItems } = await supabase
      .from('items')
      .select('name, sku, category')
      .in('id', sampleIds);

    sampleItems?.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name} (${item.sku}) - ${item.category}`);
    });
  }
}

checkFoodBottlePacks();
