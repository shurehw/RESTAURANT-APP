import { createClient } from '@supabase/supabase-js';

async function finalAudit() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  // Get exact count
  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', true);

  console.log('='.repeat(80));
  console.log('FINAL DATA AUDIT - H.WOOD GROUP - ALL ITEMS');
  console.log('='.repeat(80));
  console.log(`\n📊 TOTAL ACTIVE ITEMS: ${count}\n`);

  // Fix last name issue
  const { data: gingerItem } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('sku', 'AUTO-1768969006833-mkew8kxm9')
    .single();

  if (gingerItem && gingerItem.name.includes('3L 3L')) {
    const newName = gingerItem.name.replace('3L 3L', '3L');
    await supabase
      .from('items')
      .update({ name: newName })
      .eq('id', gingerItem.id);
    console.log('✓ Fixed: Ginger Juice name\n');
  }

  // Get all items (properly this time)
  const allItems: any[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data: batch } = await supabase
      .from('items')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .range(offset, offset + limit - 1);

    if (!batch || batch.length === 0) break;

    allItems.push(...batch);
    offset += limit;

    if (batch.length < limit) break; // Last batch
  }

  console.log(`Fetched ${allItems.length} items in batches\n`);

  // R365 Compliance
  const r365Issues = allItems.filter(item =>
    !item.name || !item.r365_measure_type || !item.r365_reporting_uom ||
    !item.r365_inventory_uom || !item.r365_cost_account || !item.r365_inventory_account
  );

  console.log('🔍 R365 COMPLIANCE');
  console.log('-'.repeat(80));
  if (r365Issues.length === 0) {
    console.log('✅ All items 100% R365 compliant');
  } else {
    console.log(`❌ ${r365Issues.length} items with issues`);
  }

  // SKU uniqueness
  const skuMap = new Map<string, number>();
  allItems.forEach(item => {
    const count = skuMap.get(item.sku) || 0;
    skuMap.set(item.sku, count + 1);
  });
  const duplicateSkus = Array.from(skuMap.entries()).filter(([_, count]) => count > 1);

  console.log('\n🔍 SKU UNIQUENESS');
  console.log('-'.repeat(80));
  if (duplicateSkus.length === 0) {
    console.log('✅ All SKUs unique');
  } else {
    console.log(`❌ ${duplicateSkus.length} duplicate SKUs`);
  }

  // Category breakdown
  const categoryMap = new Map<string, number>();
  allItems.forEach(item => {
    const count = categoryMap.get(item.category) || 0;
    categoryMap.set(item.category, count + 1);
  });

  console.log('\n🔍 CATEGORY BREAKDOWN');
  console.log('-'.repeat(80));
  Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`  ${category.padEnd(25)} ${count.toString().padStart(5)} items`);
    });

  // Pack configs
  const itemIds = allItems.map(i => i.id);
  const allPackConfigs: any[] = [];

  const batchSize = 300;
  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const { data: packConfigs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .in('item_id', batch);

    if (packConfigs) {
      allPackConfigs.push(...packConfigs);
    }
  }

  const foodCategories = ['grocery', 'bakery', 'meat', 'seafood', 'dairy', 'produce', 'food'];
  const foodItems = allItems.filter(i => foodCategories.includes(i.category));
  const foodItemIds = foodItems.map(i => i.id);
  const foodBottlePacks = allPackConfigs.filter(
    pc => foodItemIds.includes(pc.item_id) && pc.pack_type === 'bottle'
  );

  console.log('\n🔍 PACK CONFIGURATIONS');
  console.log('-'.repeat(80));
  console.log(`Total pack configs: ${allPackConfigs.length}`);
  console.log(`Food items with bottle packs: ${foodBottlePacks.length}`);

  if (foodBottlePacks.length === 0) {
    console.log('✅ No food items with bottle packs');
  } else {
    console.log(`❌ ${foodBottlePacks.length} food items still have bottle packs`);
  }

  // FINAL SUMMARY
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Items: ${allItems.length}`);
  console.log(`R365 Compliance Issues: ${r365Issues.length}`);
  console.log(`Duplicate SKUs: ${duplicateSkus.length}`);
  console.log(`Food Items with Bottle Packs: ${foodBottlePacks.length}`);

  const criticalIssues = r365Issues.length + duplicateSkus.length + foodBottlePacks.length;

  if (criticalIssues === 0) {
    console.log('\n✅✅✅ DATA IS 100% CLEAN AND OPERATIONALLY READY ✅✅✅');
  } else {
    console.log(`\n❌ ${criticalIssues} CRITICAL ISSUES REMAIN`);
  }

  console.log('='.repeat(80));
}

finalAudit();
