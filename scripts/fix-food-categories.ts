import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixFoodCategories() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Fetching food items with incorrect category structure...');

  // Get all food items where category doesn't match expected values
  const { data: items, error } = await supabase
    .from('items')
    .select('id, name, category, subcategory, item_type, base_uom')
    .eq('item_type', 'food');

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log(`Found ${items?.length || 0} food items`);

  if (!items || items.length === 0) {
    console.log('No items to fix');
    return;
  }

  // Show first 10 items to understand the structure
  console.log('\n=== SAMPLE ITEMS ===');
  items.slice(0, 10).forEach(item => {
    console.log(`${item.name}: category=${item.category}, subcategory=${item.subcategory}`);
  });

  let fixed = 0;
  let skipped = 0;

  for (const item of items) {
    // If item has a subcategory, use it as the category and remove subcategory
    if (item.subcategory) {
      const newCategory = item.subcategory.toLowerCase();

      const { error: updateError } = await supabase
        .from('items')
        .update({
          category: newCategory,
          subcategory: null  // Remove subcategory since it now matches category
        })
        .eq('id', item.id);

      if (updateError) {
        console.error(`Error updating item ${item.name}:`, updateError);
      } else {
        console.log(`✓ Fixed: ${item.name} (${item.category}/${item.subcategory} → ${newCategory})`);
        fixed++;
      }
    } else {
      skipped++;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Fixed: ${fixed} items`);
  console.log(`Skipped: ${skipped} items (already correct)`);
}

fixFoodCategories().catch(console.error);
