import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Replicate the new normalization logic from search API
function normalizeQuery(query: string): string {
  let normalized = query
    // Step 1: Handle "Case*Brand*Variant" format from OCR
    .replace(/^case\*([^*]+)\*/gi, '$1 ')  // "Case*Brand*Variant" -> "Brand Variant"
    .replace(/\*+/g, ' ')  // Remove remaining asterisks

    // Step 2: Remove special chars and punctuation
    .replace(/['\-_\/\\|]/g, ' ')  // Replace special chars with spaces (including apostrophes)
    .replace(/\d+[°']/g, ' ')  // Remove proof/ABV ratings (80', 90°, etc.)

    // Step 3: Remove pack notation and size info
    .replace(/\b\d+yr\b/gi, ' ')  // Remove age statements
    .replace(/\bmalt\b/gi, ' ')
    .replace(/\bcase\b/gi, ' ')
    .replace(/\bloose\b/gi, ' ')
    .replace(/\b\d+pk\b/gi, ' ')  // Remove pack counts (24pk, 6pk, etc.)
    .replace(/\b\d+\s*(oz|ml|lt|l|gal)\b/gi, ' ')  // Remove size info
    .replace(/\b\d+\s*$/g, ' ')  // Remove trailing numbers
    .replace(/\b6\/cs\b/gi, ' ')

    // Step 4: Remove category words
    .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal|spirit|ale|ipa|lager|stout)\b/gi, ' ')
    .replace(/\b(water|juice|syrup|soda)\b/gi, ' ')

    // Step 5: Remove origin/descriptor words
    .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian|london)\b/gi, ' ')
    .replace(/\b(fresh|organic|natural|pure|premium)\b/gi, ' ')

    // Step 6: Fix OCR truncation and artifacts
    .replace(/\b(wh|whis|whisk)\b/gi, 'whiskey')
    .replace(/\b(el0|elo)\b/gi, 'oro')
    .replace(/\b(bla\s*ck|blac\s*k)\b/gi, 'black')
    .replace(/\b(vermou)\b/gi, 'vermouth')
    .replace(/\b(pellegrino|pelligrino)\b/gi, 'san pellegrino')

    // Step 7: Normalize size abbreviations
    .replace(/\b(lt|ltr|liter)\b/gi, 'l')

    // Step 8: Clean up
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

async function testMatching() {
  // Get unmatched items
  const { data: unmatchedLines } = await supabase
    .from('invoice_lines')
    .select('id, description, item_id, invoice_id')
    .is('item_id', null)
    .limit(50);

  console.log('\n🔍 TESTING NEW MATCHING LOGIC ON UNMATCHED ITEMS');
  console.log('═'.repeat(70));
  console.log(`Testing ${unmatchedLines?.length || 0} unmatched items\n`);

  // Get all items for matching
  const { data: allItems } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true);

  let potentialMatches = 0;
  let stillUnmatched = 0;

  for (const line of unmatchedLines || []) {
    const normalized = normalizeQuery(line.description);

    // Try to find matches using normalized query
    const matches = allItems?.filter(item => {
      const itemNameLower = item.name.toLowerCase();
      const normalizedLower = normalized.toLowerCase();

      // Check if normalized query is in item name
      if (itemNameLower.includes(normalizedLower)) return true;

      // Check if item name is in normalized query
      if (normalizedLower.includes(itemNameLower)) return true;

      // Check individual words
      const words = normalizedLower.split(' ').filter(w => w.length > 3);
      const itemWords = itemNameLower.split(' ').filter(w => w.length > 3);

      // If 2+ words match, consider it a potential match
      const matchingWords = words.filter(w => itemWords.includes(w));
      return matchingWords.length >= 2;
    });

    if (matches && matches.length > 0) {
      potentialMatches++;
      console.log(`\n✅ POTENTIAL MATCH:`);
      console.log(`   Original: "${line.description}"`);
      console.log(`   Normalized: "${normalized}"`);
      console.log(`   Matches:`);
      matches.slice(0, 3).forEach(m => {
        console.log(`     - ${m.name} (${m.sku})`);
      });
    } else {
      stillUnmatched++;
      console.log(`\n❌ NEW ITEM NEEDED:`);
      console.log(`   Original: "${line.description}"`);
      console.log(`   Normalized: "${normalized}"`);
    }
  }

  console.log('\n\n📊 RESULTS');
  console.log('═'.repeat(70));
  console.log(`Total tested: ${unmatchedLines?.length || 0}`);
  console.log(`✅ Potential matches found: ${potentialMatches} (${((potentialMatches / (unmatchedLines?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`❌ Still need new items: ${stillUnmatched} (${((stillUnmatched / (unmatchedLines?.length || 1)) * 100).toFixed(1)}%)`);

  console.log(`\n💡 Next steps:`);
  console.log(`   1. Review potential matches and map them manually`);
  console.log(`   2. Create new items for the ${stillUnmatched} truly new items`);
  console.log(`   3. Ensure all new items have GL accounts assigned`);
}

testMatching();
