import { createClient } from '@supabase/supabase-js';

async function checkItems() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group

  console.log('Checking items for org:', orgId);

  const { data: items, error } = await supabase
    .from('items')
    .select('id, name, sku, category, organization_id')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .limit(10);

  console.log('Items found:', items?.length || 0);
  console.log('Error:', error);

  if (items && items.length > 0) {
    console.log('First 3 items:');
    items.slice(0, 3).forEach(item => {
      console.log(`  - ${item.name} (${item.sku}) - ${item.category}`);
    });
  }

  // Check total count
  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', true);

  console.log('Total items:', count);
}

checkItems();
