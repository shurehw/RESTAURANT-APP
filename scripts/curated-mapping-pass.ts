/**
 * Curated mapping pass - manually verified safe mappings + garbage cleanup
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Curated list of SAFE mappings (invoice description pattern → item name pattern)
const SAFE_MAPPINGS: Array<{ descPattern: RegExp; itemPattern: RegExp }> = [
  // Beverages - exact brand matches
  { descPattern: /san pellegrino.*water.*1.*lt/i, itemPattern: /san pellegrino.*1l/i },
  { descPattern: /ketel one.*vodka.*1lt/i, itemPattern: /ketel one.*1l/i },
  { descPattern: /hakushu.*12.*yr/i, itemPattern: /hakushu.*12.*year/i },
  { descPattern: /licor.*43.*1lt/i, itemPattern: /licor.*43.*1l/i },
  { descPattern: /cuarenta.*tres.*1lt/i, itemPattern: /licor.*43/i },
  { descPattern: /goose island.*ipa/i, itemPattern: /goose island.*ipa/i },
  { descPattern: /hennessy.*vs.*1lt/i, itemPattern: /hennessy.*vs.*1l/i },
  { descPattern: /juliette.*royale.*peach/i, itemPattern: /juliette.*royale.*peach/i },
  { descPattern: /komos.*reposado.*ros/i, itemPattern: /komos.*reposado.*rosa/i },
  
  // Food items - clear matches
  { descPattern: /garlic.*peeled.*4x5/i, itemPattern: /garlic.*peeled/i },
  { descPattern: /mango.*puree/i, itemPattern: /mango.*puree/i },
  { descPattern: /guava.*pink.*puree/i, itemPattern: /pink.*guava.*puree/i },
  { descPattern: /shallot.*peeled/i, itemPattern: /shallot.*peeled/i },
  { descPattern: /mint.*1.*#/i, itemPattern: /mint.*1lb|mint.*organic/i },
  { descPattern: /tarragon.*1.*#/i, itemPattern: /tarragon/i },
  { descPattern: /lettuce.*iceberg.*liner/i, itemPattern: /iceberg.*lettuce/i },
  { descPattern: /squash.*honeynut/i, itemPattern: /honeynut/i },
  { descPattern: /agave.*nectar/i, itemPattern: /agave.*nectar/i },
  { descPattern: /vinegar.*apple.*cider/i, itemPattern: /apple.*cider.*vinegar/i },
  { descPattern: /averna.*amaro/i, itemPattern: /averna.*amaro/i },
  { descPattern: /aleppo.*pepper/i, itemPattern: /aleppo.*pepper/i },
  { descPattern: /schweppes.*ginger.*ale/i, itemPattern: /ginger.*ale.*schweppes/i },
  { descPattern: /dijon.*mustard|mustard.*dijon/i, itemPattern: /dijon.*mustard/i },
  { descPattern: /cabbage.*red.*shredded/i, itemPattern: /cabbage.*red/i },
  { descPattern: /carrots.*jumbo/i, itemPattern: /carrots.*jumbo/i },
  { descPattern: /thyme.*1/i, itemPattern: /thyme/i },
  { descPattern: /tomato.*5x6/i, itemPattern: /tomato.*5x6/i },
  { descPattern: /shiro.*shoyu/i, itemPattern: /shiro.*shoyu/i },
  { descPattern: /real.*lychee/i, itemPattern: /lychee.*syrup/i },
];

// OCR garbage patterns to IGNORE
const GARBAGE_PATTERNS: RegExp[] = [
  /^gl of whl pl/i,
  /^section total/i,
  /^sales tax$/i,
  /^packer guano/i,
  /^cypess$/i,
  /^oreo.*ohtshroom/i,
  /^copper \d+$|^copper half$/i,
  /^\d+ml crv$/i,
  /^f contion/i,
  /^bermejas buseva/i,
  /^avion centenio/i,
  /^mallorca melon$/i,
];

// WRONG matches to explicitly skip (even if score seems okay)
const SKIP_PATTERNS: Array<{ desc: RegExp; wrongItem: RegExp }> = [
  { desc: /giffard.*violette/i, wrongItem: /vanille.*madagascar/i },
  { desc: /noilly.*prat.*sweet/i, wrongItem: /dry/i },
  { desc: /sunny.*vodka/i, wrongItem: /chopin/i },
  { desc: /grey.*goose.*1lt/i, wrongItem: /1\.75l/i },
  { desc: /pernod.*anise/i, wrongItem: /absinthe/i },
  { desc: /sarsacal.*gin/i, wrongItem: /still.*gin/i },
  { desc: /salas.*lychee/i, wrongItem: /soho/i },
  { desc: /honey.*wildflower/i, wrongItem: /zab.*hot/i },
];

function normalizeForTokens(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/['\-_\/\\|]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('🎯 Curated mapping pass\n');

  const inputPath = 'dev-output.unmatched-lines.grouped.json';
  const data = JSON.parse(readFileSync(inputPath, 'utf8'));
  const groups = data.groups;

  // Load all lines from JSONL
  const jsonlPath = 'dev-output.unmatched-lines.suggestions.jsonl';
  const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));

  let mapped = 0;
  let ignored = 0;
  let skipped = 0;

  // Step 1: Ignore garbage
  console.log('Step 1: Ignoring OCR garbage...\n');
  for (const line of lines) {
    const desc = line.line.description || '';
    const isGarbage = GARBAGE_PATTERNS.some(p => p.test(desc));
    
    if (isGarbage) {
      const { error } = await supabase
        .from('invoice_lines')
        .update({ is_ignored: true })
        .eq('id', line.line.id)
        .is('item_id', null);
      
      if (!error) {
        ignored++;
        console.log(`  🗑️ Ignored: "${desc.substring(0, 50)}"`);
      }
    }
  }
  console.log(`\n  Total ignored: ${ignored}\n`);

  // Step 2: Map safe matches
  console.log('Step 2: Mapping verified safe matches...\n');
  
  for (const group of groups) {
    const desc = group.exampleDescription || '';
    const suggestion = group.suggestions[0];
    if (!suggestion) continue;

    // Check if this is a known wrong match to skip
    const shouldSkip = SKIP_PATTERNS.some(
      sp => sp.desc.test(desc) && sp.wrongItem.test(suggestion.name)
    );
    if (shouldSkip) {
      skipped++;
      continue;
    }

    // Check if this matches a safe mapping pattern
    const safeMatch = SAFE_MAPPINGS.find(
      sm => sm.descPattern.test(desc) && sm.itemPattern.test(suggestion.name)
    );

    if (safeMatch) {
      // Find all lines in this group
      const groupKey = `${group.vendorId}::${normalizeForTokens(desc)}`;
      const groupLines = lines.filter(l => 
        l.invoice.vendor_id === group.vendorId && 
        normalizeForTokens(l.line.description) === normalizeForTokens(desc)
      );

      for (const line of groupLines) {
        const { error } = await supabase
          .from('invoice_lines')
          .update({ item_id: suggestion.itemId })
          .eq('id', line.line.id)
          .is('item_id', null);

        if (!error) {
          mapped++;
        }
      }
      console.log(`  ✅ Mapped ${groupLines.length}x: "${desc.substring(0, 40)}" → "${suggestion.name.substring(0, 35)}"`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Done!`);
  console.log(`   Mapped: ${mapped} lines`);
  console.log(`   Ignored (garbage): ${ignored} lines`);
  console.log(`   Skipped (wrong matches): ${skipped} groups`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
