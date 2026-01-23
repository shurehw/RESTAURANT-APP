import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testCuervoMatch() {
  // Search for all Cuervo items
  const { data: cuervoItems, error } = await supabase
    .from('items')
    .select('id, name, sku, category')
    .ilike('name', '%cuervo%')
    .eq('is_active', true);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n📋 All Cuervo items in database:');
  console.log('─────────────────────────────────────────────');
  cuervoItems?.forEach(item => {
    console.log(`  ${item.name}`);
    console.log(`    SKU: ${item.sku}`);
    console.log(`    Category: ${item.category}`);
    console.log('');
  });

  // Test the search query
  const ocrText = 'Cuervo Family Reserva*El0*';
  const normalizedQuery = ocrText
    .replace(/[*\-_\/\\|]/g, ' ')
    .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ')
    .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian)\b/gi, ' ')
    .replace(/\b(wh|whis|whisk)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('\n🔍 Search test:');
  console.log('─────────────────────────────────────────────');
  console.log(`  OCR text: "${ocrText}"`);
  console.log(`  Normalized: "${normalizedQuery}"`);

  const { data: searchResults } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true)
    .or(`name.ilike.%${normalizedQuery}%,sku.ilike.%${normalizedQuery}%`)
    .limit(5);

  console.log(`\n  Results: ${searchResults?.length || 0}`);
  searchResults?.forEach(item => {
    console.log(`    ✓ ${item.name}`);
  });

  // Try partial matches
  console.log('\n🔍 Testing partial matches:');
  console.log('─────────────────────────────────────────────');

  const partials = [
    'Cuervo Family Reserva',
    'Cuervo Familia Reposado',
    'Family Reserva',
    'Familia Reposado'
  ];

  for (const partial of partials) {
    const { data } = await supabase
      .from('items')
      .select('name')
      .eq('is_active', true)
      .ilike('name', `%${partial}%`)
      .limit(3);

    console.log(`  "${partial}": ${data?.length || 0} results`);
    data?.forEach(item => console.log(`    - ${item.name}`));
  }
}

testCuervoMatch();
