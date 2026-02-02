/**
 * Safer bulk mapping from grouped review output.
 *
 * Uses dev-output.unmatched-lines.grouped.json and maps groups where:
 * - best suggestion score >= --min-score (default 0.5)
 * - AND passes sanity checks:
 *   - at least 2 meaningful token overlaps between description and item name
 *   - if both sides contain an explicit size (e.g. 1LT, 750ML, 1.75L), sizes must match
 *   - do not map sweet<->dry vermouth/wine mismatches
 *
 * Usage:
 *   npx tsx scripts/bulk-map-from-grouped-review-safe.ts --dry-run --min-score=0.5
 *   npx tsx scripts/bulk-map-from-grouped-review-safe.ts --min-score=0.5
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

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/['\-_\/\\|]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'case',
  'cs',
  'pk',
  'pack',
  'b',
  'ea',
  'each',
  'loose',
  'fresh',
  'organic',
  'premium',
  'the',
  'and',
  'of',
  'for',
  'with',
  'lt',
  'l',
  'ml',
  'oz',
  'lb',
  'gal',
]);

// Words that are too generic to be useful as anchors for identity matching.
// (We still allow them in size parsing and general scoring elsewhere, but not as overlap anchors.)
const GENERIC_TOKENS = new Set([
  // alcohol categories / descriptors
  'vodka',
  'gin',
  'tequila',
  'mezcal',
  'bourbon',
  'whiskey',
  'whisky',
  'rum',
  'cognac',
  'brandy',
  'liqueur',
  'amaro',
  'vermouth',
  'bitters',
  'wine',
  'beer',
  'sherry',
  'champagne',
  'prosecco',
  'fino',
  'dry',
  'sweet',
  'reposado',
  'blanco',
  'anejo',
  'silver',
  'gold',
  'reserve',
  // food packaging-ish
  'import',
  'jumbo',
  'large',
  'small',
  'medium',
  'whole',
  'ground',
  'frozen',
  'frz',
  'fresh',
]);

function tokens(text: string): string[] {
  const t = normalize(text);
  if (!t) return [];
  const parts = t
    .split(' ')
    .filter(
      (p) =>
        p.length >= 3 &&
        !STOPWORDS.has(p) &&
        !GENERIC_TOKENS.has(p) &&
        !/^\d+$/.test(p) &&
        !/\d/.test(p) // exclude tokens containing digits like 750ml, 1lt, 2022
    );
  const out: string[] = [];
  for (const p of parts) if (!out.includes(p)) out.push(p);
  return out;
}

type Size = { ml: number } | null;

function parseSize(text: string): Size {
  const t = (text || '').toLowerCase();

  // Normalize "1LT" -> 1L, "750ML", "1.75L"
  // Note: we purposely ignore pack counts like 6pk, 12x etc.
  const mlMatch = t.match(/\b(\d+(\.\d+)?)\s*ml\b/);
  if (mlMatch) return { ml: Math.round(Number(mlMatch[1])) };

  const ltMatch = t.match(/\b(\d+(\.\d+)?)\s*(l|lt|ltr|liter|litre)\b/);
  if (ltMatch) return { ml: Math.round(Number(ltMatch[1]) * 1000) };

  const ozMatch = t.match(/\b(\d+(\.\d+)?)\s*oz\b/);
  if (ozMatch) return { ml: Math.round(Number(ozMatch[1]) * 29.5735) };

  return null;
}

function sizeCompatible(a: string, b: string): boolean {
  const sa = parseSize(a);
  const sb = parseSize(b);
  if (!sa || !sb) return true; // only enforce when both have explicit size
  const delta = Math.abs(sa.ml - sb.ml);
  // Allow small rounding error (e.g., 1L vs 1000ml)
  return delta <= 35; // ~1.2oz tolerance
}

function sweetDryConflict(desc: string, itemName: string): boolean {
  const d = desc.toLowerCase();
  const n = itemName.toLowerCase();
  const descSweet = /\bsweet\b/.test(d);
  const descDry = /\bdry\b/.test(d);
  const nameSweet = /\bsweet\b/.test(n);
  const nameDry = /\bdry\b/.test(n);
  // Only treat as conflict if one explicitly calls sweet and the other explicitly calls dry.
  return (descSweet && nameDry) || (descDry && nameSweet);
}

function looksWineLike(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(domaine|chateau|ch\\b|bordeaux|burgundy|montrachet|puligny|sancerre|barolo|barbaresco|cabernet|sauvignon|pinot|chardonnay|riesling|syrah|grenache|cab|vyd)\b/i.test(
    t
  );
}

function piecesHalvesConflict(desc: string, itemName: string): boolean {
  const d = desc.toLowerCase();
  const n = itemName.toLowerCase();
  const dPieces = /\bpieces\b/.test(d);
  const dHalves = /\bhalves\b/.test(d);
  const nPieces = /\bpieces\b/.test(n);
  const nHalves = /\bhalves\b/.test(n);
  return (dPieces && nHalves) || (dHalves && nPieces);
}

function tokenOverlapEnough(desc: string, itemName: string): boolean {
  const dt = tokens(desc);
  const it = tokens(itemName);
  if (dt.length === 0 || it.length === 0) return false;
  const I = new Set(it);
  const overlaps = dt.filter((t) => I.has(t));
  // Guard 1: baseline overlap threshold.
  // For wine-like strings, require 3 (many different cuvées share producer tokens).
  const wineLike = looksWineLike(desc) || looksWineLike(itemName);
  // We intentionally do NOT auto-map wine-like items in this script; they need human review.
  if (wineLike) return false;
  const required = wineLike ? 3 : 2;
  if (overlaps.length < required) return false;

  // Guard 2: avoid "brand-only" matches.
  // If the overlap is only the first 1-2 tokens (brand/producer), require at least one extra shared token.
  const brandish = new Set<string>([...dt.slice(0, 2), ...it.slice(0, 2)]);
  const overlapsOutsideBrand = overlaps.filter((t) => !brandish.has(t));
  if (overlapsOutsideBrand.length === 0) return false;

  return true;
}

type GroupedData = {
  groups: Array<{
    vendorId: string;
    vendorName: string;
    exampleDescription: string;
    count: number;
    suggestions: Array<{
      itemId: string;
      name: string;
      score: number;
    }>;
  }>;
};

type JsonlLine = {
  line: { id: string; description: string; vendor_item_code: string | null };
  invoice: { vendor_id: string };
};

async function main() {
  const dryRun = hasFlag('dry-run');
  const minScore = Number(parseArg('min-score') || '0.5');

  console.log('🗺️  Safe bulk mapping from grouped review\n');
  console.log(`- Mode: ${dryRun ? 'DRY RUN' : 'LIVE UPDATE'}`);
  console.log(`- Minimum score: ${Math.round(minScore * 100)}%`);
  console.log(`- Guards: tokenOverlap>=2, sizeMatch(if present), no sweet/dry flip\n`);

  const groupedPath = 'dev-output.unmatched-lines.grouped.json';
  const jsonlPath = 'dev-output.unmatched-lines.suggestions.jsonl';

  const grouped: GroupedData = JSON.parse(readFileSync(groupedPath, 'utf8'));
  const jsonl = readFileSync(jsonlPath, 'utf8').trim().split('\n');
  const lines: JsonlLine[] = jsonl.filter(Boolean).map((l) => JSON.parse(l));

  // Build lookup of all line IDs by vendor + normalized description
  const lineIdsByKey = new Map<string, string[]>();
  for (const l of lines) {
    const key = `${l.invoice.vendor_id}::${normalize(l.line.description || '')}`;
    if (!lineIdsByKey.has(key)) lineIdsByKey.set(key, []);
    lineIdsByKey.get(key)!.push(l.line.id);
  }

  const candidates = grouped.groups
    .map((g) => {
      const best = g.suggestions[0];
      return { g, best };
    })
    .filter((x) => x.best && x.best.score >= minScore);

  let eligibleGroups = 0;
  let eligibleLines = 0;
  let skippedToken = 0;
  let skippedSize = 0;
  let skippedSweetDry = 0;
  let skippedNoLines = 0;

  const toMap: Array<{ lineId: string; itemId: string }> = [];

  for (const { g, best } of candidates as any) {
    const desc = g.exampleDescription || '';
    const itemName = best.name || '';

    if (sweetDryConflict(desc, itemName)) {
      skippedSweetDry += 1;
      continue;
    }
    if (piecesHalvesConflict(desc, itemName)) {
      skippedToken += 1;
      continue;
    }
    if (!sizeCompatible(desc, itemName)) {
      skippedSize += 1;
      continue;
    }
    if (!tokenOverlapEnough(desc, itemName)) {
      skippedToken += 1;
      continue;
    }

    const key = `${g.vendorId}::${normalize(desc)}`;
    const ids = lineIdsByKey.get(key) || [];
    if (ids.length === 0) {
      skippedNoLines += 1;
      continue;
    }

    eligibleGroups += 1;
    eligibleLines += ids.length;
    for (const id of ids) toMap.push({ lineId: id, itemId: best.itemId });
  }

  console.log(`Groups above score threshold: ${candidates.length}`);
  console.log(`Eligible after guards: ${eligibleGroups} groups, ${eligibleLines} lines`);
  console.log(
    `Skipped groups: token=${skippedToken}, size=${skippedSize}, sweet/dry=${skippedSweetDry}, noLines=${skippedNoLines}\n`
  );

  if (dryRun) {
    console.log('Sample mappings:\n');
    const sample = toMap.slice(0, 25);
    for (const m of sample) {
      // find a representative group line (cheap scan ok for sample)
      const line = lines.find((l) => l.line.id === m.lineId);
      const group = grouped.groups.find(
        (g) =>
          g.vendorId === (line?.invoice.vendor_id || '') &&
          normalize(g.exampleDescription) === normalize(line?.line.description || '')
      );
      const best = group?.suggestions?.[0];
      if (group && best) {
        console.log(
          `[${Math.round(best.score * 100)}%] ${group.vendorName}: "${group.exampleDescription}" -> "${best.name}"`
        );
      }
    }
    if (toMap.length > 25) console.log(`\n... and ${toMap.length - 25} more lines`);
    console.log('\nRun without --dry-run to apply.');
    return;
  }

  if (toMap.length === 0) {
    console.log('No safe mappings to apply.');
    return;
  }

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
          .is('item_id', null)
      )
    );

    for (const r of results) {
      if (r.error) failed += 1;
      else updated += 1;
    }
    if ((i + BATCH_SIZE) % 200 === 0 || i + BATCH_SIZE >= toMap.length) {
      console.log(`  ✅ Processed ${Math.min(i + BATCH_SIZE, toMap.length)}/${toMap.length}...`);
    }
  }

  console.log(`\n✅ Done! Updated: ${updated} | Failed: ${failed} | Total: ${toMap.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

