import { createClient } from '@supabase/supabase-js';

async function testDonJulioMatch() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  console.log('Testing Don Julio matching...\n');

  // Search for Don Julio in items
  const { data: items } = await supabase
    .from('items')
    .select('id, sku, name, category, is_active')
    .eq('organization_id', orgId)
    .or('name.ilike.%don julio%,sku.ilike.%don julio%')
    .limit(10);

  console.log(`Found ${items?.length || 0} items matching "Don Julio":\n`);

  if (items && items.length > 0) {
    items.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name} (${item.sku})`);
      console.log(`   Active: ${item.is_active}, Category: ${item.category}`);
      console.log('');
    });
  } else {
    console.log('❌ No Don Julio items found!');
  }

  // Check if there are inactive items
  const { data: inactiveItems, count } = await supabase
    .from('items')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('is_active', false)
    .or('name.ilike.%don julio%,sku.ilike.%don julio%');

  if (count && count > 0) {
    console.log(`⚠️  Found ${count} INACTIVE Don Julio items`);
    inactiveItems?.forEach(item => {
      console.log(`  - ${item.name} (${item.sku})`);
    });
  }

  // Test the search API endpoint simulation
  console.log('\n' + '-'.repeat(80));
  console.log('Testing search API logic...\n');

  const searchQuery = 'don julio';

  const { data: searchResults } = await supabase
    .from('items')
    .select('id, sku, name, category, base_uom')
    .eq('is_active', true)
    .or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
    .order('name')
    .limit(10);

  console.log(`Search results for "${searchQuery}":`);
  if (searchResults && searchResults.length > 0) {
    searchResults.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name} (${item.sku})`);
    });
  } else {
    console.log('  ❌ No results');
  }

  // Check if there's an organization_id filter issue
  console.log('\n' + '-'.repeat(80));
  console.log('Checking organization_id filtering...\n');

  const { data: allDonJulio } = await supabase
    .from('items')
    .select('id, name, organization_id, is_active')
    .ilike('name', '%don julio%')
    .limit(20);

  console.log('All Don Julio items (any org):');
  allDonJulio?.forEach(item => {
    const isHwood = item.organization_id === orgId;
    console.log(`  - ${item.name}`);
    console.log(`    Org: ${item.organization_id} ${isHwood ? '✓ (h.wood)' : '✗'}, Active: ${item.is_active}`);
  });
}

testDonJulioMatch();
