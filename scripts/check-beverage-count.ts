import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkBeverages() {
  // Get org ID
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);

  const orgId = items?.[0]?.organization_id;
  console.log('Organization ID:', orgId);
  console.log('');

  // Count by category
  const { data: counts } = await supabase
    .from('items')
    .select('category')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  const categoryCounts: Record<string, number> = {};
  counts?.forEach((item: any) => {
    categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
  });

  console.log('Items by category:');
  Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
  console.log('');

  // Check Don Julio specifically
  const { data: donJulio } = await supabase
    .from('items')
    .select('name, sku, category, organization_id, is_active')
    .eq('organization_id', orgId)
    .ilike('name', '%don julio%');

  console.log(`Don Julio items in org ${orgId}:`);
  console.log(`  Total: ${donJulio?.length || 0}`);
  donJulio?.forEach((item: any) => {
    console.log(`  - ${item.name} (active: ${item.is_active})`);
  });
}

checkBeverages();
