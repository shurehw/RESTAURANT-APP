import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testSearch() {
  const testQuery = 'Don Julio Tequila*Anejo';
  const normalizedQuery = testQuery
    .replace(/[*\-_\/\\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`Original query: "${testQuery}"`);
  console.log(`Normalized query: "${normalizedQuery}"`);
  console.log('');

  const { data: items } = await supabase
    .from('items')
    .select('name, sku, category')
    .ilike('name', `%${normalizedQuery}%`)
    .limit(10);

  console.log(`Search results (${items?.length || 0}):`);
  items?.forEach((item: any) => {
    console.log(`  - ${item.name} (${item.sku})`);
  });

  // Try shorter search
  console.log('\n\nTrying shorter search: "Don Julio Anejo"');
  const { data: items2 } = await supabase
    .from('items')
    .select('name, sku, category')
    .ilike('name', '%Don Julio%Anejo%')
    .limit(10);

  console.log(`Results (${items2?.length || 0}):`);
  items2?.forEach((item: any) => {
    console.log(`  - ${item.name} (${item.sku})`);
  });
}

testSearch();
