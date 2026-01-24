import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkHibiki() {
  // Get org ID
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);

  const orgId = items?.[0]?.organization_id;

  // Search for Hibiki
  const { data: hibiki } = await supabase
    .from('items')
    .select('name, sku, category, is_active')
    .eq('organization_id', orgId)
    .ilike('name', '%hibiki%');

  console.log(`Hibiki items found: ${hibiki?.length || 0}`);
  hibiki?.forEach((item: any) => {
    console.log(`  - ${item.name} (${item.sku}) - Active: ${item.is_active}`);
  });

  // Try the normalized search that the API would use
  const query = 'Hibiki Harmony Japanese Wh';
  const normalizedQuery = query
    .replace(/[*\-_\/\\|]/g, ' ')
    .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log(`\nOriginal query: "${query}"`);
  console.log(`Normalized query: "${normalizedQuery}"`);

  const { data: searchResults } = await supabase
    .from('items')
    .select('name, sku')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .or(`name.ilike.%${normalizedQuery}%,sku.ilike.%${normalizedQuery}%`)
    .limit(10);

  console.log(`\nSearch results: ${searchResults?.length || 0}`);
  searchResults?.forEach((item: any) => {
    console.log(`  - ${item.name}`);
  });
}

checkHibiki();
