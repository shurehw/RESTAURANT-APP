import { createClient } from '@supabase/supabase-js';

async function checkCategories() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: items } = await supabase
    .from('items')
    .select('category, subcategory')
    .eq('organization_id', '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41')
    .eq('is_active', true);

  const categories = new Set<string>();
  const subcategories = new Set<string>();

  items?.forEach(item => {
    if (item.category) categories.add(item.category);
    if (item.subcategory) subcategories.add(item.subcategory);
  });

  console.log('All Categories:', Array.from(categories).sort());
  console.log('\nAll Subcategories:', Array.from(subcategories).sort());
}

checkCategories();
