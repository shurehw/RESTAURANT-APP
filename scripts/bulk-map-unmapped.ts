import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Normalize text for fuzzy matching
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity score between two strings
function similarity(s1: string, s2: string): number {
  const n1 = normalize(s1);
  const n2 = normalize(s2);

  // Exact match
  if (n1 === n2) return 1.0;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 0.8;

  // Check word overlap
  const words1 = new Set(n1.split(' '));
  const words2 = new Set(n2.split(' '));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const minScore = parseFloat(process.argv.find(arg => arg.startsWith('--min-score='))?.split('=')[1] || '0.8');

  console.log('🔍 Bulk mapping unmapped invoice lines...');
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE UPDATE'}`);
  console.log(`   Minimum Score: ${(minScore * 100).toFixed(0)}%\n`);

  // Get all unmapped invoice lines
  const { data: unmappedLines, error: linesError } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      invoice:invoices(
        id,
        invoice_number,
        vendor:vendors(name)
      )
    `)
    .is('item_id', null)
    .gt('qty', 0)
    .order('description');

  if (linesError) {
    console.error('❌ Error fetching unmapped lines:', linesError);
    return;
  }

  console.log(`Found ${unmappedLines?.length || 0} unmapped invoice lines\n`);

  // Get all items
  const { data: items, error: itemsError } = await supabase
    .from('items')
    .select('id, name, category, subcategory')
    .eq('is_active', true);

  if (itemsError) {
    console.error('❌ Error fetching items:', itemsError);
    return;
  }

  console.log(`Searching against ${items?.length || 0} active items\n`);

  const matches: Array<{
    lineId: string;
    lineDescription: string;
    itemId: string;
    itemName: string;
    score: number;
  }> = [];

  for (const line of unmappedLines || []) {
    // Find best matching item
    let bestMatch: any = null;
    let bestScore = 0;

    for (const item of items || []) {
      const score = similarity(line.description, item.name);
      if (score > bestScore && score >= minScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch) {
      matches.push({
        lineId: line.id,
        lineDescription: line.description,
        itemId: bestMatch.id,
        itemName: bestMatch.name,
        score: bestScore,
      });
    }
  }

  console.log(`✅ Found ${matches.length} matches above ${(minScore * 100).toFixed(0)}% threshold\n`);

  if (matches.length === 0) {
    console.log('No matches to update. Exiting.');
    return;
  }

  if (dryRun) {
    console.log('🔍 DRY RUN - Would update these lines:\n');
    matches.slice(0, 50).forEach((match, i) => {
      console.log(`${i + 1}. [${(match.score * 100).toFixed(0)}%] "${match.lineDescription}"`);
      console.log(`   → "${match.itemName}"\n`);
    });
    if (matches.length > 50) {
      console.log(`... and ${matches.length - 50} more\n`);
    }
    console.log(`\nTo apply these changes, run without --dry-run flag`);
    return;
  }

  // Apply updates in batches
  console.log('💾 Applying updates...\n');
  let updated = 0;
  let failed = 0;

  const BATCH_SIZE = 100;
  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);

    for (const match of batch) {
      const { error } = await supabase
        .from('invoice_lines')
        .update({ item_id: match.itemId })
        .eq('id', match.lineId);

      if (error) {
        console.log(`   ❌ Failed: "${match.lineDescription}" - ${error.message}`);
        failed++;
      } else {
        updated++;
        if (updated % 10 === 0) {
          console.log(`   ✅ Updated ${updated}/${matches.length}...`);
        }
      }
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ Complete! Updated: ${updated} | Failed: ${failed} | Total: ${matches.length}`);
}

main().catch(console.error);
