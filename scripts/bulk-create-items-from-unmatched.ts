/**
 * Bulk create items from unmatched invoice line groups.
 *
 * Reads dev-output.unmatched-lines.grouped.json and:
 * 1. Creates new items for groups meeting criteria
 * 2. Maps all lines in those groups to the new items
 * 3. Creates vendor_item_aliases for future auto-matching
 *
 * Usage:
 *   npx tsx scripts/bulk-create-items-from-unmatched.ts --dry-run
 *   npx tsx scripts/bulk-create-items-from-unmatched.ts --min-count=2 --max-suggestion-score=0.5
 *   npx tsx scripts/bulk-create-items-from-unmatched.ts --limit=50
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.split('=').slice(1).join('=').trim() || null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type Group = {
  vendorId: string;
  vendorName: string;
  orgId: string;
  normalizedDescription: string;
  exampleDescription: string;
  count: number;
  sampleLines: Array<{
    lineId: string;
    vendorItemCode: string | null;
    unitCost: number | null;
  }>;
  suggestions: Array<{
    itemId: string;
    name: string;
    score: number;
  }>;
};

type GroupedData = {
  groups: Group[];
};

function normalizeForTokens(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/['\-_\/\\|]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanItemName(desc: string): string {
  let cleaned = desc
    // Remove vendor prefix patterns
    .replace(/^case\*?/i, '')
    .replace(/\*+/g, ' ')
    // Remove trailing variable weights like "29.40 LB" or "17.26 LB 16.38 LB"
    .replace(/(\s+\d+\.?\d*\s*(lb|lbs?|#))+\s*$/gi, '')
    // Remove warehouse location codes like "PIH: 2" or "Plt#: 10" or "Pkg: 50"
    .replace(/\s+(pih|plt#?|pkg):?\s*\d+\s*$/gi, '')
    // Remove trailing weight ranges like "/LB" at the end
    .replace(/\s*\/\s*(lb|lbs?)\s*$/gi, '')
    // Remove pack/case notation
    .replace(/\b\d+\/cs\b/gi, '')
    .replace(/\bcs\s*\/\s*\d+\b/gi, '')
    .replace(/\b\d+\s*\/\s*cs\b/gi, '')
    .replace(/\bb\/cs\b/gi, '')
    .replace(/\b\d+pk\b/gi, '')
    .replace(/\b\d+ct\b/gi, '')
    // Remove trailing "CS" or "BC" (box case)
    .replace(/\s+(cs|bc)\s*$/gi, '')
    // Normalize size patterns but keep them
    .replace(/\s+/g, ' ')
    .trim();

  // Title case
  cleaned = cleaned
    .split(' ')
    .map((word) => {
      if (word.match(/^\d+[a-z]+$/i)) return word.toUpperCase(); // Size like "750ML"
      if (word.length <= 3 && word === word.toUpperCase()) return word; // Acronyms
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  return cleaned;
}

function inferCategory(desc: string): string {
  const lower = desc.toLowerCase();

  // Beverages / Spirits
  if (/\b(vodka|gin|rum|whiskey|whisky|bourbon|tequila|mezcal|cognac|brandy)\b/.test(lower)) return 'spirits';
  // Wine can appear as producer shorthand (e.g. "CH" for Chateau) without the word "wine"
  if (/^\s*ch\b/.test(lower)) return 'wine';
  if (/\b(wine|champagne|prosecco|cava|pinot|chardonnay|cabernet|merlot|rosé|rose|riesling|syrah|grenache)\b/.test(lower)) return 'wine';
  if (/\b(chateau|domaine|bordeaux|burgundy|montrachet|puligny|sancerre|barolo|barbaresco)\b/.test(lower)) return 'wine';
  if (/\b(cab)\b/.test(lower)) return 'wine';
  if (/\b(beer|ale|lager|ipa|stout|pilsner)\b/.test(lower)) return 'beer';
  if (/\b(liqueur|amaro|vermouth|aperol|campari|bitters|creme|crème)\b/.test(lower)) return 'liqueur';
  if (/\b(juice|soda|tonic|water|red bull|monster|cola|sprite)\b/.test(lower)) return 'non_alcoholic_beverage';

  // Food categories
  if (/\b(chicken|beef|pork|lamb|steak|ribeye|filet|bacon|sausage)\b/.test(lower)) return 'meat';
  if (/\b(salmon|tuna|shrimp|lobster|crab|oyster|fish|seafood)\b/.test(lower)) return 'seafood';
  if (/\b(lettuce|spinach|arugula|kale|tomato|onion|pepper|carrot|celery|micro|herb)\b/.test(lower)) return 'produce';
  if (/\b(cheese|butter|cream|milk|yogurt|ricotta|parmesan|mozzarella)\b/.test(lower)) return 'dairy';
  if (/\b(flour|sugar|salt|pepper|spice|oil|vinegar|sauce|honey|agave)\b/.test(lower)) return 'pantry';
  if (/\b(bread|bun|roll|tortilla|pasta|rice|grain)\b/.test(lower)) return 'bakery';

  // Supplies
  if (/\b(napkin|towel|glove|wrap|foil|container|bag|box)\b/.test(lower)) return 'supplies';

  return 'food'; // Default
}

function inferItemType(category: string): 'food' | 'beverage' | 'other' {
  const beverageCategories = ['spirits', 'wine', 'beer', 'liqueur', 'non_alcoholic_beverage'];
  const otherCategories = ['supplies', 'packaging', 'chemicals', 'smallwares'];

  if (beverageCategories.includes(category)) return 'beverage';
  if (otherCategories.includes(category)) return 'other';
  return 'food';
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const minCount = parseInt(parseArg('min-count') || '2', 10);
  const maxSuggestionScore = parseFloat(parseArg('max-suggestion-score') || '0.6');
  const limit = parseArg('limit') ? parseInt(parseArg('limit')!, 10) : null;

  console.log('🆕 Bulk create items from unmatched invoice line groups\n');
  console.log(`- Mode: ${dryRun ? 'DRY RUN' : 'LIVE CREATE'}`);
  console.log(`- Min count per group: ${minCount}`);
  console.log(`- Max existing suggestion score: ${Math.round(maxSuggestionScore * 100)}% (groups with better matches are skipped)`);
  if (limit) console.log(`- Limit: ${limit} groups`);
  console.log('');

  const inputPath = 'dev-output.unmatched-lines.grouped.json';
  let data: GroupedData;
  try {
    data = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch (e) {
    console.log(`❌ Could not read ${inputPath}. Run review-unmatched-invoice-lines.ts first.`);
    return;
  }

  // Filter eligible groups:
  // - count >= minCount
  // - best suggestion score < maxSuggestionScore (no good existing match)
  let eligible = data.groups.filter((g) => {
    if (g.count < minCount) return false;
    const bestScore = g.suggestions[0]?.score || 0;
    if (bestScore >= maxSuggestionScore) return false;
    return true;
  });

  // Sort by count descending (most impactful first)
  eligible.sort((a, b) => b.count - a.count);

  // Deduplicate by (vendorId + cleaned item name) to avoid creating duplicate items
  type DedupeGroup = Group & { relatedNormalizedDescs: string[] };
  const dedupeMap = new Map<string, DedupeGroup>();
  for (const g of eligible) {
    const cleanedName = cleanItemName(g.exampleDescription);
    const dedupeKey = `${g.vendorId}::${cleanedName.toLowerCase()}`;
    if (!dedupeMap.has(dedupeKey)) {
      dedupeMap.set(dedupeKey, { ...g, relatedNormalizedDescs: [g.normalizedDescription] });
    } else {
      const existing = dedupeMap.get(dedupeKey)!;
      existing.count += g.count;
      existing.relatedNormalizedDescs.push(g.normalizedDescription);
    }
  }
  const dedupedGroups = Array.from(dedupeMap.values());
  console.log(`Deduplicated ${eligible.length} groups into ${dedupedGroups.length} unique items\n`);
  eligible = dedupedGroups;

  if (limit) {
    eligible = eligible.slice(0, limit);
  }

  console.log(`Found ${eligible.length} groups eligible for item creation\n`);

  if (eligible.length === 0) {
    console.log('No groups to process. Try lowering --min-count or raising --max-suggestion-score.');
    return;
  }

  // Load all lines from JSONL for mapping
  const jsonlPath = 'dev-output.unmatched-lines.suggestions.jsonl';
  let allLines: Array<{ lineId: string; vendorId: string; normalizedDesc: string; vendorItemCode: string | null }>;
  try {
    const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n');
    allLines = lines.map((l) => {
      const parsed = JSON.parse(l);
      return {
        lineId: parsed.line.id,
        vendorId: parsed.invoice.vendor_id,
        normalizedDesc: normalizeForTokens(parsed.line.description),
        vendorItemCode: parsed.line.vendor_item_code,
      };
    });
  } catch (e) {
    console.log(`❌ Could not read ${jsonlPath}. Run review-unmatched-invoice-lines.ts first.`);
    return;
  }

  // Build lookup for lines by group key
  const linesByGroupKey = new Map<string, typeof allLines>();
  for (const line of allLines) {
    const key = `${line.vendorId}::${line.normalizedDesc}`;
    if (!linesByGroupKey.has(key)) linesByGroupKey.set(key, []);
    linesByGroupKey.get(key)!.push(line);
  }

  // Helper to get all lines for a group (handles deduplication)
  function getLinesForGroup(g: DedupeGroup): typeof allLines {
    const descs = g.relatedNormalizedDescs || [g.normalizedDescription];
    const result: typeof allLines = [];
    for (const desc of descs) {
      const key = `${g.vendorId}::${desc}`;
      const lines = linesByGroupKey.get(key) || [];
      result.push(...lines);
    }
    return result;
  }

  if (dryRun) {
    console.log('DRY RUN - Would create these items:\n');
    let totalLines = 0;
    for (const g of eligible.slice(0, 30)) {
      const itemName = cleanItemName(g.exampleDescription);
      const category = inferCategory(g.exampleDescription);
      const groupLines = getLinesForGroup(g as DedupeGroup);
      const lineCount = groupLines.length || g.count;
      totalLines += lineCount;
      console.log(`📦 "${itemName}" (${category})`);
      console.log(`   From: "${g.exampleDescription}"`);
      console.log(`   Vendor: ${g.vendorName}`);
      console.log(`   Lines: ${lineCount}${g.relatedNormalizedDescs?.length > 1 ? ` (merged from ${g.relatedNormalizedDescs.length} variations)` : ''}`);
      console.log('');
    }
    if (eligible.length > 30) {
      for (const g of eligible.slice(30)) {
        const groupLines = getLinesForGroup(g as DedupeGroup);
        totalLines += groupLines.length || g.count;
      }
      console.log(`... and ${eligible.length - 30} more groups`);
    }
    console.log(`\nTotal lines that would be mapped: ${totalLines}`);
    console.log('\nRun without --dry-run to apply.');
    return;
  }

  // Live mode: create items and map lines
  let itemsCreated = 0;
  let linesMapped = 0;
  let aliasesCreated = 0;

  for (const g of eligible) {
    const itemName = cleanItemName(g.exampleDescription);
    const category = inferCategory(g.exampleDescription);
    const itemType = inferItemType(category);
    const sku = `AUTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Create the item
    const { data: newItem, error: itemError } = await supabase
      .from('items')
      .insert({
        name: itemName,
        sku,
        category,
        item_type: itemType,
        base_uom: 'unit',
        organization_id: g.orgId,
        is_active: true,
      })
      .select('id')
      .single();

    if (itemError) {
      console.log(`❌ Failed to create item "${itemName}": ${itemError.message}`);
      continue;
    }

    itemsCreated++;
    const itemId = newItem.id;

    // Find all lines for this group (including merged variations) and map them
    const groupLines = getLinesForGroup(g as DedupeGroup);

    for (const line of groupLines) {
      const { error: mapError } = await supabase
        .from('invoice_lines')
        .update({ item_id: itemId })
        .eq('id', line.lineId)
        .is('item_id', null);

      if (!mapError) {
        linesMapped++;
      }

      // Create vendor alias if we have a vendor item code
      if (line.vendorItemCode) {
        const { error: aliasError } = await supabase
          .from('vendor_item_aliases')
          .upsert(
            {
              vendor_id: g.vendorId,
              item_id: itemId,
              vendor_item_code: line.vendorItemCode,
              vendor_description: g.exampleDescription,
              is_active: true,
            },
            { onConflict: 'vendor_id,vendor_item_code' }
          );

        if (!aliasError) {
          aliasesCreated++;
        }
      }
    }

    if (itemsCreated % 10 === 0) {
      console.log(`  ✅ Created ${itemsCreated} items, mapped ${linesMapped} lines...`);
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Items created: ${itemsCreated}`);
  console.log(`   Lines mapped: ${linesMapped}`);
  console.log(`   Vendor aliases created: ${aliasesCreated}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
