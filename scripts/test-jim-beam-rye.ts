import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testJimBeamRye() {
  // Search for Jim Beam Rye items
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .ilike('name', '%jim beam rye%')
    .eq('is_active', true);

  console.log('Jim Beam Rye items in database:');
  items?.forEach(item => console.log('  -', item.name, '(' + item.sku + ')'));

  // Test the normalization
  const query = "Jim Beam Rye Whiskey*80'";
  let normalized = query
    .replace(/[*\-_\/\\|]/g, ' ')
    .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ')
    .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian)\b/gi, ' ')
    .replace(/\b(wh|whis|whisk)\b/gi, ' ')
    .replace(/\b(el0|oro|elo)\b/gi, ' ')
    .replace(/\b(fresh|juice|syrup)\b/gi, ' ')
    .replace(/\b6\/cs\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('\nOriginal query:', query);
  console.log('Normalized query:', normalized);

  // Test search with normalized query
  const { data: results } = await supabase
    .from('items')
    .select('name, sku')
    .eq('is_active', true)
    .or(`name.ilike.%${normalized}%,sku.ilike.%${normalized}%`)
    .limit(5);

  console.log('\nSearch results for "' + normalized + '":');
  if (results && results.length > 0) {
    results.forEach(r => console.log('  ✓', r.name));
  } else {
    console.log('  ❌ No results');
  }

  // Try just "jim beam rye"
  const simpler = "jim beam rye";
  const { data: results2 } = await supabase
    .from('items')
    .select('name, sku')
    .eq('is_active', true)
    .or(`name.ilike.%${simpler}%,sku.ilike.%${simpler}%`)
    .limit(5);

  console.log('\nSearch results for "' + simpler + '":');
  if (results2 && results2.length > 0) {
    results2.forEach(r => console.log('  ✓', r.name));
  } else {
    console.log('  ❌ No results');
  }
}

testJimBeamRye();
