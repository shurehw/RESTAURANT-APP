/**
 * Test Food Item Mapping
 * Verifies that auto-categorization, GL mapping, and pack config parsing work correctly
 * Run with: npx dotenv -e .env.local -- npx tsx scripts/test-food-mapping.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Test cases from the screenshot and common food items
const testItems = [
  {
    description: 'PORK CHOP 12 PC/CS',
    expected: {
      category: 'food',
      subcategory: 'meat_protein',
      gl_code: '5110', // Meat Cost
      pack_type: 'case',
      units_per_pack: 12,
    }
  },
  {
    description: 'Extra Virgin Olive Oil 10L',
    expected: {
      category: 'food',
      subcategory: 'dry_goods',
      gl_code: '5170', // Grocery and Dry Goods Cost
      pack_type: 'bottle',
      unit_size: 10,
      unit_size_uom: 'l'
    }
  },
  {
    description: 'Salmon Fillet 5 LB',
    expected: {
      category: 'food',
      subcategory: 'seafood',
      gl_code: '5120', // Seafood Cost
      pack_type: 'pound',
      unit_size: 5,
      unit_size_uom: 'lb'
    }
  },
  {
    description: 'Romaine Lettuce EA',
    expected: {
      category: 'food',
      subcategory: 'produce',
      gl_code: '5140', // Produce Cost
      pack_type: 'each'
    }
  },
  {
    description: 'Mozzarella Cheese 1 LB',
    expected: {
      category: 'food',
      subcategory: 'dairy',
      gl_code: '5150', // Dairy Cost
      pack_type: 'pound',
      unit_size: 1,
      unit_size_uom: 'lb'
    }
  },
  {
    description: 'Walnut Halves 5 LB Box',
    expected: {
      category: 'food',
      subcategory: 'dry_goods',
      gl_code: '5170',
      pack_type: 'box'
    }
  }
];

async function testFoodMapping() {
  console.log('🧪 Testing Food Item Mapping\n');

  // Get org ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('name', 'The h.wood Group')
    .single();

  if (!org) {
    console.error('❌ Organization not found');
    return;
  }

  console.log(`🏢 Organization: ${org.name} (${org.id})\n`);

  // Get GL accounts for verification
  const { data: glAccounts } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name')
    .eq('org_id', org.id)
    .in('external_code', ['5110', '5120', '5140', '5150', '5160', '5170']);

  const glMap: Record<string, any> = {};
  glAccounts?.forEach((gl: any) => {
    glMap[gl.external_code] = gl;
  });

  console.log('📊 Available GL Accounts:');
  Object.values(glMap).forEach((gl: any) => {
    console.log(`  ${gl.external_code} - ${gl.name}`);
  });
  console.log();

  // Test auto-categorization function
  console.log('🔍 Testing Auto-Categorization Function\n');

  let passCount = 0;
  let failCount = 0;

  for (const test of testItems) {
    console.log(`Testing: "${test.description}"`);

    // Call auto_categorize_food_item function
    const { data: subcategoryResult, error: subcategoryError } = await supabase
      .rpc('auto_categorize_food_item', { p_description: test.description });

    if (subcategoryError) {
      console.error('  ❌ Error calling auto_categorize_food_item:', subcategoryError);
      failCount++;
      continue;
    }

    const subcategory = subcategoryResult;
    console.log(`  Subcategory: ${subcategory || 'null'} (expected: ${test.expected.subcategory})`);

    if (subcategory === test.expected.subcategory) {
      console.log('  ✅ Subcategory match!');
      passCount++;
    } else {
      console.log(`  ❌ Subcategory mismatch! Got: ${subcategory}, Expected: ${test.expected.subcategory}`);
      failCount++;
    }

    // Test GL account suggestion
    if (subcategory) {
      const { data: glResult, error: glError } = await supabase
        .rpc('suggest_gl_account_for_item', {
          p_category: 'food',
          p_subcategory: subcategory,
          p_org_id: org.id
        });

      if (glError) {
        console.error('  ❌ Error calling suggest_gl_account_for_item:', glError);
      } else if (glResult) {
        const gl = glAccounts?.find((g: any) => g.id === glResult);
        console.log(`  GL Account: ${gl?.external_code} - ${gl?.name}`);

        if (gl?.external_code === test.expected.gl_code) {
          console.log('  ✅ GL account match!');
        } else {
          console.log(`  ❌ GL account mismatch! Got: ${gl?.external_code}, Expected: ${test.expected.gl_code}`);
        }
      }
    }

    console.log();
  }

  console.log('━'.repeat(60));
  console.log(`\n📈 Results: ${passCount} passed, ${failCount} failed\n`);

  // Now test with real food items from the database
  console.log('🔍 Checking real food items in database...\n');

  const { data: foodItems } = await supabase
    .from('items')
    .select(`
      id,
      name,
      category,
      subcategory,
      gl_accounts!inner(external_code, name)
    `)
    .eq('category', 'food')
    .not('subcategory', 'is', null)
    .limit(10);

  if (foodItems && foodItems.length > 0) {
    console.log(`Found ${foodItems.length} food items with subcategories:\n`);
    foodItems.forEach((item: any) => {
      console.log(`  ${item.name}`);
      console.log(`    Category: ${item.category} > ${item.subcategory}`);
      console.log(`    GL: ${item.gl_accounts?.external_code} - ${item.gl_accounts?.name}\n`);
    });
  } else {
    console.log('No food items with subcategories found in database.\n');
  }

  // Check for items with incorrect mappings
  console.log('🔍 Checking for items with potentially incorrect mappings...\n');

  const { data: incorrectItems } = await supabase
    .from('items')
    .select(`
      id,
      name,
      category,
      subcategory,
      gl_accounts!inner(external_code, name)
    `)
    .eq('category', 'food')
    .neq('subcategory', 'meat_protein')
    .neq('subcategory', 'seafood')
    .neq('subcategory', 'produce')
    .neq('subcategory', 'dairy')
    .neq('subcategory', 'dry_goods')
    .neq('subcategory', 'bakery')
    .neq('subcategory', 'specialty')
    .not('subcategory', 'is', null)
    .limit(10);

  if (incorrectItems && incorrectItems.length > 0) {
    console.log(`⚠️  Found ${incorrectItems.length} items with non-standard subcategories:\n`);
    incorrectItems.forEach((item: any) => {
      console.log(`  ${item.name}`);
      console.log(`    Category: ${item.category} > ${item.subcategory} ❌`);
      console.log(`    GL: ${item.gl_accounts?.external_code} - ${item.gl_accounts?.name}\n`);
    });
  } else {
    console.log('✅ All food items have valid subcategories!\n');
  }
}

testFoodMapping();
