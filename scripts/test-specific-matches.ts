import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const testCases = [
  { query: "Jim Beam Rye Whiskey*80'", expectedBrand: "Jim Beam Rye" },
  { query: "Hakushu Japanese Malt*12Yr", expectedBrand: "Hakushu" },
  { query: "Giffard*Villa De Hedoges", expectedBrand: "Giffard" },
  { query: "Dolin Blanc Vermouth", expectedBrand: "Dolin" },
  { query: "Clement Banana Liqueur", expectedBrand: "Clement" },
  { query: "Cincoro Tequila*Reposado 6", expectedBrand: "Cincoro" },
];

async function testMatches() {
  for (const test of testCases) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Testing: "${test.query}"`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Apply full normalization
    let normalized = test.query
      .replace(/[*\-_\/\\|]/g, ' ')
      .replace(/\b\d+[°']\b/g, ' ')  // Remove proof/ABV
      .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ')
      .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian)\b/gi, ' ')
      .replace(/\b(wh|whis|whisk)\b/gi, ' ')
      .replace(/\b(el0|oro|elo)\b/gi, ' ')
      .replace(/\b(fresh|juice|syrup)\b/gi, ' ')
      .replace(/\b6\/cs\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    normalized = normalized
      .replace(/\bfamily\b/gi, 'familia')
      .replace(/\breserva\b/gi, 'reposado')
      .replace(/\baperitivo\b/gi, 'apertivo');

    normalized = normalized
      .replace(/\bliqueu\b/gi, 'liqueur')
      .replace(/\bbergamett\b/gi, 'bergamotto')
      .replace(/\bvermou\b/gi, 'vermouth')
      .replace(/\bchampag\b/gi, 'champagne')
      .replace(/\breposad\b/gi, 'reposado');

    console.log(`Normalized: "${normalized}"`);

    // Search database
    const { data: results } = await supabase
      .from('items')
      .select('name, sku')
      .eq('is_active', true)
      .or(`name.ilike.%${normalized}%,sku.ilike.%${normalized}%`)
      .limit(10);

    if (results && results.length > 0) {
      console.log(`✅ Found ${results.length} match(es):`);
      results.forEach(r => console.log(`   - ${r.name} (${r.sku})`));
    } else {
      console.log('❌ No matches found');

      // Try searching for brand only
      const { data: brandResults } = await supabase
        .from('items')
        .select('name, sku')
        .eq('is_active', true)
        .ilike('name', `%${test.expectedBrand}%`)
        .limit(5);

      if (brandResults && brandResults.length > 0) {
        console.log(`\n💡 Found ${brandResults.length} items with "${test.expectedBrand}" in database:`);
        brandResults.forEach(r => console.log(`   - ${r.name} (${r.sku})`));
      }
    }
  }
}

testMatches();
