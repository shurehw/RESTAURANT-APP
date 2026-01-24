import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkDonJulio() {
  console.log('Searching for Don Julio items...\n');

  // Get all Don Julio items
  const { data: items, error } = await supabase
    .from('items')
    .select('id, name, sku, category, organization_id, is_active')
    .ilike('name', '%don julio%');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${items?.length || 0} Don Julio items:\n`);
  items?.forEach((item, idx) => {
    console.log(`${idx + 1}. ${item.name}`);
    console.log(`   SKU: ${item.sku}`);
    console.log(`   Category: ${item.category}`);
    console.log(`   Active: ${item.is_active}`);
    console.log(`   Org ID: ${item.organization_id}`);
    console.log('');
  });

  // Test normalized search
  const testQuery = 'Don Julio Tequila*Anejo';
  const normalizedQuery = testQuery
    .replace(/[*\-_\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`\nTest Query: "${testQuery}"`);
  console.log(`Normalized: "${normalizedQuery}"\n`);

  const { data: searchResults } = await supabase
    .from('items')
    .select('id, name, sku')
    .ilike('name', `%${normalizedQuery}%`)
    .limit(5);

  console.log(`Search results for normalized query:`);
  searchResults?.forEach((item) => {
    console.log(`  - ${item.name} (${item.sku})`);
  });
}

checkDonJulio().catch(console.error);
