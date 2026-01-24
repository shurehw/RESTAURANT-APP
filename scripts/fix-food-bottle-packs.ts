import { createClient } from '@supabase/supabase-js';

async function fixFoodBottlePacks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  console.log('Finding food items with "bottle" pack configurations...\n');

  // Get all food items
  const foodCategories = ['grocery', 'bakery', 'meat', 'seafood', 'dairy', 'produce', 'food'];

  const { data: foodItems } = await supabase
    .from('items')
    .select('id, name, sku, category')
    .eq('organization_id', orgId)
    .in('category', foodCategories)
    .eq('is_active', true)
    .limit(10000);

  console.log(`Total food items: ${foodItems?.length || 0}`);

  // Get pack configs in batches
  const foodItemIds = foodItems?.map(i => i.id) || [];
  const allBottlePacks: any[] = [];

  const batchSize = 300;
  for (let i = 0; i < foodItemIds.length; i += batchSize) {
    const batch = foodItemIds.slice(i, i + batchSize);
    const { data: packConfigs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .in('item_id', batch)
      .eq('pack_type', 'bottle');

    if (packConfigs) {
      allBottlePacks.push(...packConfigs);
    }
  }

  console.log(`Found ${allBottlePacks.length} food items with "bottle" pack configs\n`);

  if (allBottlePacks.length === 0) {
    console.log('✅ No bottle packs to fix!');
    return;
  }

  // Show sample
  console.log('Sample items (first 10):');
  const sampleIds = allBottlePacks.slice(0, 10).map(p => p.item_id);
  const { data: sampleItems } = await supabase
    .from('items')
    .select('name, sku, category')
    .in('id', sampleIds);

  sampleItems?.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.name} (${item.sku}) - ${item.category}`);
  });

  console.log(`\n... and ${allBottlePacks.length - 10} more\n`);

  // Strategy: Delete bottle pack configs for food items
  // These were auto-generated and don't make sense for food items
  console.log('FIXING: Deleting "bottle" pack configs from food items...\n');

  let deletedCount = 0;

  for (const pack of allBottlePacks) {
    const { error } = await supabase
      .from('item_pack_configurations')
      .delete()
      .eq('id', pack.id);

    if (error) {
      console.error(`Error deleting pack ${pack.id}:`, error);
    } else {
      deletedCount++;
      if (deletedCount % 50 === 0) {
        console.log(`  Deleted ${deletedCount}/${allBottlePacks.length}...`);
      }
    }
  }

  console.log(`\n✅ Successfully deleted ${deletedCount} incorrect "bottle" pack configurations`);
  console.log('\nNote: Items will keep their "case" pack configs if they have them.');
  console.log('You can manually add appropriate pack types (bag, box, each) as needed.');
}

fixFoodBottlePacks();
