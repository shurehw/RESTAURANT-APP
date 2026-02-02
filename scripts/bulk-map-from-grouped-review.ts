/**
 * Bulk map invoice lines using the grouped review output.
 *
 * Reads dev-output.unmatched-lines.grouped.json and maps lines where the
 * top suggestion meets the minimum score threshold.
 *
 * Usage:
 *   npx tsx scripts/bulk-map-from-grouped-review.ts --dry-run
 *   npx tsx scripts/bulk-map-from-grouped-review.ts --min-score=0.7
 *   npx tsx scripts/bulk-map-from-grouped-review.ts --min-score=0.85
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

type GroupedData = {
  groups: Array<{
    vendorId: string;
    vendorName: string;
    exampleDescription: string;
    count: number;
    sampleLines: Array<{
      lineId: string;
      vendorItemCode: string | null;
    }>;
    suggestions: Array<{
      itemId: string;
      name: string;
      score: number;
    }>;
  }>;
};

async function main() {
  const dryRun = hasFlag('dry-run');
  const minScoreRaw = parseArg('min-score');
  const minScore = minScoreRaw ? parseFloat(minScoreRaw) : 0.7;

  console.log('🗺️  Bulk mapping from grouped review output\n');
  console.log(`- Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}`);
  console.log(`- Minimum score: ${Math.round(minScore * 100)}%\n`);

  const inputPath = 'dev-output.unmatched-lines.grouped.json';
  let data: GroupedData;
  try {
    data = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch (e) {
    console.log(`❌ Could not read ${inputPath}. Run review-unmatched-invoice-lines.ts first.`);
    return;
  }

  // Filter groups with high-confidence suggestions
  const eligible = data.groups.filter((g) => {
    const best = g.suggestions[0];
    return best && best.score >= minScore;
  });

  console.log(`Found ${eligible.length} groups with score >= ${Math.round(minScore * 100)}%\n`);

  if (eligible.length === 0) {
    console.log('No groups to map. Try lowering --min-score.');
    return;
  }

  // Collect all line IDs to map (we need to fetch them since sampleLines is limited to 5)
  // Actually, the grouped output only has sample lines. We need to query DB for all lines
  // matching vendor + normalized description.

  // For simplicity, we'll use the JSONL file which has every line.
  const jsonlPath = 'dev-output.unmatched-lines.suggestions.jsonl';
  let allLines: Array<{ lineId: string; vendorId: string; normalizedDesc: string; suggestions: Array<{ itemId: string; score: number }> }>;
  try {
    const lines = readFileSync(jsonlPath, 'utf8').trim().split('\n');
    allLines = lines.map((l) => {
      const parsed = JSON.parse(l);
      return {
        lineId: parsed.line.id,
        vendorId: parsed.invoice.vendor_id,
        normalizedDesc: normalizeForTokens(parsed.line.description),
        suggestions: parsed.suggestions,
      };
    });
  } catch (e) {
    console.log(`❌ Could not read ${jsonlPath}. Run review-unmatched-invoice-lines.ts first.`);
    return;
  }

  // Build lookup: vendorId::normalizedDesc -> best itemId (if score >= minScore)
  const eligibleGroups = new Map<string, string>();
  for (const g of eligible) {
    const key = `${g.vendorId}::${normalizeForTokens(g.exampleDescription)}`;
    eligibleGroups.set(key, g.suggestions[0].itemId);
  }

  // Find all lines that match eligible groups
  const toMap: Array<{ lineId: string; itemId: string }> = [];
  for (const line of allLines) {
    const key = `${line.vendorId}::${line.normalizedDesc}`;
    const itemId = eligibleGroups.get(key);
    if (itemId) {
      toMap.push({ lineId: line.lineId, itemId });
    }
  }

  console.log(`Total lines to map: ${toMap.length}\n`);

  if (dryRun) {
    // Show sample
    console.log('DRY RUN - Would map these lines:\n');
    const sample = toMap.slice(0, 30);
    for (const m of sample) {
      const line = allLines.find((l) => l.lineId === m.lineId);
      const group = eligible.find((g) => `${g.vendorId}::${normalizeForTokens(g.exampleDescription)}` === `${line?.vendorId}::${line?.normalizedDesc}`);
      if (group) {
        const s = group.suggestions[0];
        console.log(`[${Math.round(s.score * 100)}%] "${group.exampleDescription}" → "${s.name}"`);
      }
    }
    if (toMap.length > 30) {
      console.log(`\n... and ${toMap.length - 30} more`);
    }
    console.log('\nRun without --dry-run to apply.');
    return;
  }

  // Apply updates
  console.log('Applying updates...\n');
  let updated = 0;
  let failed = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < toMap.length; i += BATCH_SIZE) {
    const batch = toMap.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((m) =>
        supabase
          .from('invoice_lines')
          .update({ item_id: m.itemId })
          .eq('id', m.lineId)
          .is('item_id', null) // safety: only update if still unmapped
      )
    );

    for (const r of results) {
      if (r.error) {
        failed++;
      } else {
        updated++;
      }
    }

    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= toMap.length) {
      console.log(`  ✅ Processed ${Math.min(i + BATCH_SIZE, toMap.length)}/${toMap.length}...`);
    }
  }

  console.log(`\n✅ Done! Updated: ${updated} | Failed: ${failed} | Total: ${toMap.length}`);
}

function normalizeForTokens(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/['\-_\/\\|]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });
