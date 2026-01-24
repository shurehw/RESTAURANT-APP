import { createClient } from '@supabase/supabase-js';

async function comprehensiveAudit() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  console.log('='.repeat(80));
  console.log('COMPREHENSIVE DATA AUDIT - H.WOOD GROUP');
  console.log('='.repeat(80));
  console.log('\n');

  // 1. Get all items (no limit - fetch all)
  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(10000); // Set high limit to get all items

  console.log(`📊 TOTAL ITEMS: ${items?.length || 0}\n`);

  // 2. Check R365 Required Fields
  console.log('🔍 R365 REQUIRED FIELDS VALIDATION');
  console.log('-'.repeat(80));

  const r365Issues: any[] = [];

  items?.forEach(item => {
    const issues: string[] = [];

    if (!item.name) issues.push('Missing name');
    if (!item.r365_measure_type) issues.push('Missing r365_measure_type');
    if (!item.r365_reporting_uom) issues.push('Missing r365_reporting_uom');
    if (!item.r365_inventory_uom) issues.push('Missing r365_inventory_uom');
    if (!item.r365_cost_account) issues.push('Missing r365_cost_account');
    if (!item.r365_inventory_account) issues.push('Missing r365_inventory_account');

    if (issues.length > 0) {
      r365Issues.push({ sku: item.sku, name: item.name, issues });
    }
  });

  if (r365Issues.length === 0) {
    console.log('✅ All items have complete R365 required fields');
  } else {
    console.log(`❌ ${r365Issues.length} items have missing R365 fields:`);
    r365Issues.slice(0, 10).forEach(item => {
      console.log(`  - ${item.name} (${item.sku}): ${item.issues.join(', ')}`);
    });
    if (r365Issues.length > 10) {
      console.log(`  ... and ${r365Issues.length - 10} more`);
    }
  }

  // 3. Check SKU uniqueness
  console.log('\n🔍 SKU UNIQUENESS CHECK');
  console.log('-'.repeat(80));

  const skuMap = new Map<string, number>();
  items?.forEach(item => {
    const count = skuMap.get(item.sku) || 0;
    skuMap.set(item.sku, count + 1);
  });

  const duplicateSkus = Array.from(skuMap.entries()).filter(([_, count]) => count > 1);

  if (duplicateSkus.length === 0) {
    console.log('✅ All SKUs are unique');
  } else {
    console.log(`❌ ${duplicateSkus.length} duplicate SKUs found:`);
    duplicateSkus.slice(0, 10).forEach(([sku, count]) => {
      console.log(`  - ${sku}: ${count} duplicates`);
    });
  }

  // 4. Check item names for issues
  console.log('\n🔍 ITEM NAME VALIDATION');
  console.log('-'.repeat(80));

  const nameIssues: any[] = [];

  items?.forEach(item => {
    const issues: string[] = [];

    // Check for doubled words
    if (/(\b\w+\b)\s+\1\b/i.test(item.name)) {
      issues.push('Contains doubled words');
    }

    // Check for leading numbers (like "1Goma")
    if (/^[0-9]/.test(item.name)) {
      issues.push('Starts with number');
    }

    // Check for multiple spaces
    if (/\s{2,}/.test(item.name)) {
      issues.push('Contains multiple consecutive spaces');
    }

    if (issues.length > 0) {
      nameIssues.push({ sku: item.sku, name: item.name, issues });
    }
  });

  if (nameIssues.length === 0) {
    console.log('✅ All item names appear clean');
  } else {
    console.log(`⚠️  ${nameIssues.length} items with potential name issues:`);
    nameIssues.slice(0, 20).forEach(item => {
      console.log(`  - ${item.name} (${item.sku}): ${item.issues.join(', ')}`);
    });
    if (nameIssues.length > 20) {
      console.log(`  ... and ${nameIssues.length - 20} more`);
    }
  }

  // 5. Category distribution
  console.log('\n🔍 CATEGORY DISTRIBUTION');
  console.log('-'.repeat(80));

  const categoryMap = new Map<string, number>();
  items?.forEach(item => {
    const count = categoryMap.get(item.category) || 0;
    categoryMap.set(item.category, count + 1);
  });

  Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      console.log(`  ${category.padEnd(25)} ${count.toString().padStart(5)} items`);
    });

  // 6. Check pack configurations
  console.log('\n🔍 PACK CONFIGURATION VALIDATION');
  console.log('-'.repeat(80));

  // Fetch pack configs in batches to avoid .in() limits
  const itemIds = items?.map(i => i.id) || [];
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

  console.log(`Total pack configs: ${allPackConfigs?.length || 0}`);

  const itemsWithPacks = new Set(allPackConfigs?.map(pc => pc.item_id));
  const itemsWithoutPacks = items?.filter(i => !itemsWithPacks.has(i.id));

  console.log(`Items WITH pack configs: ${itemsWithPacks.size}`);
  console.log(`Items WITHOUT pack configs: ${itemsWithoutPacks?.length || 0}`);

  // Check for food items with "bottle" pack type
  const foodCategories = ['grocery', 'bakery', 'meat', 'seafood', 'dairy', 'produce', 'food'];
  const foodItems = items?.filter(i => foodCategories.includes(i.category)) || [];
  const foodItemIds = foodItems.map(i => i.id);

  const foodBottlePacks = allPackConfigs?.filter(
    pc => foodItemIds.includes(pc.item_id) && pc.pack_type === 'bottle'
  );

  if (foodBottlePacks && foodBottlePacks.length > 0) {
    console.log(`\n⚠️  ${foodBottlePacks.length} FOOD items have "bottle" pack configs (likely incorrect):`);

    const sampleFoodBottles = foodBottlePacks.slice(0, 10);
    for (const pack of sampleFoodBottles) {
      const item = items?.find(i => i.id === pack.item_id);
      console.log(`  - ${item?.name} (${item?.sku}) - ${item?.category}`);
    }

    if (foodBottlePacks.length > 10) {
      console.log(`  ... and ${foodBottlePacks.length - 10} more`);
    }
  } else {
    console.log('✅ No food items with incorrect "bottle" pack types');
  }

  // 7. UOM Consistency Check
  console.log('\n🔍 UOM CONSISTENCY CHECK');
  console.log('-'.repeat(80));

  const uomIssues: any[] = [];

  items?.forEach(item => {
    const issues: string[] = [];

    // Check if base_uom exists
    if (!item.base_uom) {
      issues.push('Missing base_uom');
    }

    // Check for R365 UOM mismatches (common issue)
    if (item.r365_reporting_uom && item.r365_inventory_uom) {
      if (item.r365_reporting_uom !== item.r365_inventory_uom) {
        // This is actually OK for R365, just noting it
        // issues.push('R365 reporting and inventory UOMs differ');
      }
    }

    if (issues.length > 0) {
      uomIssues.push({ sku: item.sku, name: item.name, issues });
    }
  });

  if (uomIssues.length === 0) {
    console.log('✅ All items have base_uom defined');
  } else {
    console.log(`❌ ${uomIssues.length} items with UOM issues:`);
    uomIssues.slice(0, 10).forEach(item => {
      console.log(`  - ${item.name} (${item.sku}): ${item.issues.join(', ')}`);
    });
  }

  // 8. Summary
  console.log('\n' + '='.repeat(80));
  console.log('AUDIT SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Items: ${items?.length || 0}`);
  console.log(`R365 Compliance Issues: ${r365Issues.length}`);
  console.log(`Duplicate SKUs: ${duplicateSkus.length}`);
  console.log(`Name Format Issues: ${nameIssues.length}`);
  console.log(`UOM Issues: ${uomIssues.length}`);
  console.log(`Food Items with "Bottle" Packs: ${foodBottlePacks?.length || 0}`);
  console.log(`Items Without Pack Configs: ${itemsWithoutPacks?.length || 0}`);

  const totalIssues = r365Issues.length + duplicateSkus.length + (foodBottlePacks?.length || 0) + uomIssues.length;

  if (totalIssues === 0) {
    console.log('\n✅ DATA IS 100% CLEAN AND READY FOR R365 IMPORT');
  } else {
    console.log(`\n⚠️  TOTAL CRITICAL ISSUES TO FIX: ${totalIssues}`);
  }

  console.log('='.repeat(80));
}

comprehensiveAudit();
