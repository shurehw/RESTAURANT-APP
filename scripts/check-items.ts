import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkItems() {
  // Get total count
  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true });

  console.log('Total items in database:', count);

  // Get recent items
  const { data: recentItems } = await supabase
    .from('items')
    .select('id, name, organization_id, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\nRecent 10 items:');
  recentItems?.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name} (org: ${item.organization_id}, active: ${item.is_active})`);
  });

  // Get count by organization
  const { data: orgs } = await supabase
    .from('items')
    .select('organization_id')
    .eq('is_active', true);

  const orgCounts = new Map<string, number>();
  orgs?.forEach(item => {
    orgCounts.set(item.organization_id, (orgCounts.get(item.organization_id) || 0) + 1);
  });

  console.log('\nItems per organization:');
  for (const [orgId, count] of orgCounts.entries()) {
    console.log(`  ${orgId}: ${count} items`);
  }
}

checkItems();
