import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkInactive() {
  // Get org ID
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);

  const orgId = items?.[0]?.organization_id;

  // Count all items
  const { count: totalCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  // Count active items
  const { count: activeCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', true);

  // Count inactive items
  const { count: inactiveCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', false);

  console.log('Item counts:');
  console.log(`  Total: ${totalCount}`);
  console.log(`  Active: ${activeCount}`);
  console.log(`  Inactive: ${inactiveCount}`);
  console.log('');

  // Check liquor items specifically
  const { data: liquorActive } = await supabase
    .from('items')
    .select('name')
    .eq('organization_id', orgId)
    .eq('category', 'liquor')
    .eq('is_active', true);

  const { data: liquorInactive } = await supabase
    .from('items')
    .select('name')
    .eq('organization_id', orgId)
    .eq('category', 'liquor')
    .eq('is_active', false);

  console.log('Liquor items:');
  console.log(`  Active: ${liquorActive?.length || 0}`);
  console.log(`  Inactive: ${liquorInactive?.length || 0}`);

  if (liquorInactive && liquorInactive.length > 0) {
    console.log('\nFirst 10 inactive liquor items:');
    liquorInactive.slice(0, 10).forEach((item: any) => {
      console.log(`  - ${item.name}`);
    });
  }
}

checkInactive();
