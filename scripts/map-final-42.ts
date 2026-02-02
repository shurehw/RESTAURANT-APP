/**
 * Map the final 42 remaining unmatched invoice lines.
 * 
 * Strategy:
 * 1. Map high-confidence matches (score >= 0.8 or exact product match)
 * 2. Create new items for the rest
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dryRun = process.argv.includes('--dry-run');

interface LineEntry {
  line: {
    id: string;
    description: string;
    vendor_item_code: string | null;
  };
  invoice: {
    vendor_id: string;
    vendor_name: string;
    organization_id: string;
  };
  suggestions: Array<{
    itemId: string;
    name: string;
    score: number;
  }>;
}

// Clear mappings based on manual review - these are definitely the same product
const CURATED_MAPS: Array<{ descPattern: RegExp; itemNamePattern: RegExp }> = [
  // 1.0 score matches
  { descPattern: /sunny vodka.*750ml/i, itemNamePattern: /sunny vodka 750ml/i },
  { descPattern: /noilly prat vermouth origin 1lt/i, itemNamePattern: /noilly prot vermouth origin 1lt/i },
  { descPattern: /case\*noilly prat vermouth.*1lt/i, itemNamePattern: /noilly prot vermouth origin 1lt/i },
  { descPattern: /still g\.?i\.?n\.? dry gin 1lt/i, itemNamePattern: /still g\.?i\.?n/i },
  // High confidence
  { descPattern: /bushmills irish single malt 10yr/i, itemNamePattern: /bushmills/i },
  { descPattern: /gifford?\*?creme de violette/i, itemNamePattern: /giffard creme de violette/i },
  { descPattern: /les carmes haut-?brion.*lignan/i, itemNamePattern: /les carmes haut.*brion.*lignan/i },
  { descPattern: /ch les carmes haut-?brion.*lgn/i, itemNamePattern: /les carmes haut.*brion.*lignan/i },
  // Produce exact matches
  { descPattern: /watercress f\/s/i, itemNamePattern: /lettuce watercress/i },
  { descPattern: /grapefruit ruby 36ct/i, itemNamePattern: /ruby grapefruit/i },
  { descPattern: /garlic peeled import/i, itemNamePattern: /garlic peeled/i },
  // Wine variations that are the same
  { descPattern: /domaine leflaive bienvenue/i, itemNamePattern: /domaine leflaive/i },
  { descPattern: /ch bean sejour bordeaux/i, itemNamePattern: /ch bean sejour/i },
  { descPattern: /dolin dry vermouth/i, itemNamePattern: /dolin vermouth.*dry/i },
  { descPattern: /tio pepe fino sherr?y/i, itemNamePattern: /tio pepe fino sherry/i },
  { descPattern: /carpano antica formula/i, itemNamePattern: /antica formula vermouth/i },
  // Vermouth - same brand different size should map
  { descPattern: /noilly prat vermouth sweet 375ml/i, itemNamePattern: /noilly prat vermouth sweet/i },
  // Lyre's NA drinks
  { descPattern: /lyre.*coffee original/i, itemNamePattern: /lyre.*coffee/i },
  { descPattern: /lyre.*agave.*blanco/i, itemNamePattern: /lyre.*agave blanco/i },
  // Walnut match
  { descPattern: /walnut pieces/i, itemNamePattern: /walnut/i },
];

function cleanItemName(desc: string): string {
  return desc
    .replace(/^case\*?/i, '')
    .replace(/\*+/g, ' ')
    .replace(/(\s+\d+\.?\d*\s*(lb|lbs?|#))+\s*$/gi, '')
    .replace(/\s+(pih|plt#?|pkg):?\s*\d+\s*$/gi, '')
    .replace(/\s*\/\s*(lb|lbs?)\s*$/gi, '')
    .replace(/\b\d+\/cs\b/gi, '')
    .replace(/\bcs\s*\/\s*\d+\b/gi, '')
    .replace(/\b\d+\s*\/\s*cs\b/gi, '')
    .replace(/\bb\/cs\b/gi, '')
    .replace(/\b\d+pk\b/gi, '')
    .replace(/\b\d+ct\b/gi, '')
    .replace(/\s+(cs|bc)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      if (word.match(/^\d+[a-z]+$/i)) return word.toUpperCase();
      if (word.length <= 3 && word === word.toUpperCase()) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function inferCategory(desc: string): string {
  const lower = desc.toLowerCase();
  if (/tequila|mezcal|reposado|anejo|blanco|silver|cristalino/.test(lower)) return 'liquor';
  if (/vodka|gin|rum|whiskey|bourbon|scotch|cognac|brandy/.test(lower)) return 'liquor';
  if (/vermouth|liqueur|amaro|aperitivo|aperol|campari/.test(lower)) return 'liquor';
  if (/wine|champagne|bordeaux|burgundy|montrachet|cab|merlot|pinot|chardonnay/.test(lower)) return 'wine';
  if (/beef|pork|lamb|chicken|veal|wagyu|tenderloin|striploin/.test(lower)) return 'meat';
  if (/lyre|na\s|non-?alcoholic/.test(lower)) return 'non_alcoholic_beverage';
  if (/garlic|watercress|grapefruit|walnut|olive|evoo/.test(lower)) return 'produce';
  return 'food';
}

function inferItemType(category: string): string {
  const beverages = new Set(['wine', 'liquor', 'beer', 'spirits', 'liqueur', 'non_alcoholic_beverage']);
  return beverages.has(category) ? 'beverage' : 'food';
}

async function main() {
  console.log(`🔄 Mapping final 42 unmatched lines (${dryRun ? 'DRY RUN' : 'LIVE'})\n`);

  const jsonlPath = 'dev-output.unmatched-lines.suggestions.jsonl';
  const lines: LineEntry[] = readFileSync(jsonlPath, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));

  console.log(`Found ${lines.length} lines to process\n`);

  let mapped = 0;
  let created = 0;

  for (const entry of lines) {
    const desc = entry.line.description;
    const suggestions = entry.suggestions || [];

    // Try curated mappings first
    let itemId: string | null = null;
    for (const cm of CURATED_MAPS) {
      if (cm.descPattern.test(desc)) {
        // Find a suggestion matching the item pattern
        const match = suggestions.find((s) => cm.itemNamePattern.test(s.name));
        if (match) {
          itemId = match.itemId;
          if (dryRun) {
            console.log(`✓ Curated: "${desc}" => "${match.name}"`);
          }
          break;
        }
      }
    }

    // If no curated match, check if top suggestion has score >= 0.95 (near-exact)
    if (!itemId && suggestions.length > 0 && suggestions[0].score >= 0.95) {
      itemId = suggestions[0].itemId;
      if (dryRun) {
        console.log(`✓ High-score (${suggestions[0].score.toFixed(2)}): "${desc}" => "${suggestions[0].name}"`);
      }
    }

    if (itemId) {
      // Map the line
      if (!dryRun) {
        const { error } = await supabase
          .from('invoice_lines')
          .update({ item_id: itemId })
          .eq('id', entry.line.id)
          .is('item_id', null);
        if (error) {
          console.log(`❌ Map failed for "${desc}": ${error.message}`);
          continue;
        }
      }
      mapped++;
    } else {
      // Create new item
      const itemName = cleanItemName(desc);
      const category = inferCategory(desc);
      const itemType = inferItemType(category);

      if (dryRun) {
        console.log(`+ Create: "${itemName}" (${category}) from "${desc}"`);
      } else {
        const sku = `AUTO-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const { data: newItem, error } = await supabase
          .from('items')
          .insert({
            name: itemName,
            sku,
            category,
            item_type: itemType,
            base_uom: 'unit',
            organization_id: entry.invoice.organization_id,
            is_active: true,
          })
          .select('id')
          .single();

        if (error) {
          console.log(`❌ Create failed for "${itemName}": ${error.message}`);
          continue;
        }

        // Map the line
        await supabase
          .from('invoice_lines')
          .update({ item_id: newItem.id })
          .eq('id', entry.line.id);

        // Create vendor alias if we have a code
        if (entry.line.vendor_item_code) {
          await supabase.from('vendor_item_aliases').upsert(
            {
              vendor_id: entry.invoice.vendor_id,
              item_id: newItem.id,
              vendor_item_code: entry.line.vendor_item_code,
              vendor_description: desc,
            },
            { onConflict: 'vendor_id,vendor_item_code' }
          );
        }
      }
      created++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Mapped to existing: ${mapped}`);
  console.log(`   Created new items: ${created}`);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
