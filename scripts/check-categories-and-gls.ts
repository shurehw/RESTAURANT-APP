import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkData() {
  console.log('\n=== Category Distribution ===\n');

  // Get category counts
  const { data: items } = await supabase
    .from('items')
    .select('category, subcategory, gl_account_id')
    .eq('is_active', true);

  const categoryMap = new Map<string, number>();
  const subcategoryMap = new Map<string, number>();
  const glMap = new Map<string, number>();
  let itemsWithGL = 0;
  let itemsWithoutGL = 0;

  for (const item of items || []) {
    // Count categories
    const cat = item.category || 'null';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);

    // Count subcategories
    const subcat = item.subcategory || 'null';
    subcategoryMap.set(subcat, (subcategoryMap.get(subcat) || 0) + 1);

    // Count GL accounts
    if (item.gl_account_id) {
      itemsWithGL++;
      glMap.set(item.gl_account_id, (glMap.get(item.gl_account_id) || 0) + 1);
    } else {
      itemsWithoutGL++;
    }
  }

  // Sort by count descending
  const sortedCategories = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
  const sortedSubcategories = Array.from(subcategoryMap.entries()).sort((a, b) => b[1] - a[1]);

  console.log('Categories:');
  for (const [cat, count] of sortedCategories) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\n=== Subcategory Distribution ===\n');
  for (const [subcat, count] of sortedSubcategories.slice(0, 20)) {
    console.log(`  ${subcat}: ${count}`);
  }
  if (sortedSubcategories.length > 20) {
    console.log(`  ... and ${sortedSubcategories.length - 20} more subcategories`);
  }

  console.log('\n=== GL Account Status ===\n');
  console.log(`Items with GL Account: ${itemsWithGL}`);
  console.log(`Items without GL Account: ${itemsWithoutGL}`);
  console.log(`Unique GL Accounts: ${glMap.size}`);

  // Get GL account details
  if (glMap.size > 0) {
    const glIds = Array.from(glMap.keys());
    const { data: glAccounts } = await supabase
      .from('gl_accounts')
      .select('id, external_code, name, section')
      .in('id', glIds);

    console.log('\n=== Top GL Accounts ===\n');
    const glWithNames = glAccounts?.map(gl => ({
      ...gl,
      count: glMap.get(gl.id) || 0
    })).sort((a, b) => b.count - a.count).slice(0, 10);

    for (const gl of glWithNames || []) {
      console.log(`  ${gl.external_code} - ${gl.name} (${gl.section}): ${gl.count} items`);
    }
  }

  console.log('\n');
}

checkData();
