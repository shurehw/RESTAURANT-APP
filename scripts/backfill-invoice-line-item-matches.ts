/**
 * Backfill invoice_lines.item_id where currently null.
 *
 * Strategy (SAFE, unambiguous only):
 * 1) If vendor_item_code matches exactly 1 items.sku (after normalization variants) -> set item_id
 * 2) Else if vendor_item_code matches exactly 1 item_pack_configurations.item_id (after variants) -> set item_id
 *
 * This does NOT attempt fuzzy description matching.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type InvoiceLineRow = {
  id: string;
  vendor_item_code: string | null;
  description: string | null;
};

function buildCodeVariants(code: string): string[] {
  const raw = code.trim();
  if (!raw) return [];
  const noSpaces = raw.replace(/\s+/g, '');
  const noDelims = raw.replace(/[\s-_/\\.]/g, '');
  const upper = raw.toUpperCase();
  const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || s;

  const candidates = [
    raw,
    upper,
    noSpaces,
    noDelims,
    stripLeadingZeros(raw),
    stripLeadingZeros(noSpaces),
    stripLeadingZeros(noDelims),
  ];

  const uniq: string[] = [];
  for (const c of candidates) {
    const v = c.trim();
    if (v && !uniq.includes(v)) uniq.push(v);
  }
  return uniq;
}

async function main() {
  console.log('🧩 Backfilling invoice_lines.item_id from vendor_item_code\n');

  const pageSize = 1000;
  let from = 0;
  let updated = 0;
  let skippedNoCode = 0;
  let skippedAmbiguous = 0;
  let matchedBySku = 0;
  let matchedByPackConfig = 0;

  while (true) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select('id, vendor_item_code, description')
      .is('item_id', null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    const rows = data as InvoiceLineRow[];

    // Build one big variant set for this page to batch lookups
    const variantsByLineId = new Map<string, string[]>();
    const variantUniverse: string[] = [];
    for (const row of rows) {
      const code = row.vendor_item_code?.trim() || '';
      if (!code) {
        skippedNoCode += 1;
        continue;
      }
      const variants = buildCodeVariants(code);
      if (variants.length === 0) {
        skippedNoCode += 1;
        continue;
      }
      variantsByLineId.set(row.id, variants);
      for (const v of variants) {
        if (!variantUniverse.includes(v)) variantUniverse.push(v);
      }
    }

    if (variantUniverse.length === 0) {
      if (rows.length < pageSize) break;
      from += pageSize;
      continue;
    }

    // Batch query items by sku
    const { data: skuRows, error: skuErr } = await supabase
      .from('items')
      .select('id, sku')
      .in('sku', variantUniverse)
      .eq('is_active', true);
    if (skuErr) throw skuErr;

    const skuToItemId = new Map<string, string>();
    for (const r of skuRows || []) {
      skuToItemId.set(r.sku, r.id);
    }

    // Batch query pack configs by vendor_item_code
    const { data: packRows, error: packErr } = await supabase
      .from('item_pack_configurations')
      .select('item_id, vendor_item_code')
      .in('vendor_item_code', variantUniverse);
    if (packErr) throw packErr;

    // Build code -> unique item_id mapping only when unambiguous
    const codeToItemIds = new Map<string, Set<string>>();
    for (const r of packRows || []) {
      if (!codeToItemIds.has(r.vendor_item_code)) codeToItemIds.set(r.vendor_item_code, new Set());
      codeToItemIds.get(r.vendor_item_code)!.add(r.item_id);
    }

    const codeToUniqueItemId = new Map<string, string>();
    for (const [code, ids] of codeToItemIds.entries()) {
      if (ids.size === 1) codeToUniqueItemId.set(code, Array.from(ids)[0]);
    }

    // Prepare bulk updates
    const updates: Array<{ id: string; item_id: string }> = [];

    for (const row of rows) {
      const variants = variantsByLineId.get(row.id);
      if (!variants) continue; // already counted as no-code above

      // Prefer items.sku direct match (unique by definition)
      const skuHit = variants.map((v) => skuToItemId.get(v)).find(Boolean);
      if (skuHit) {
        updates.push({ id: row.id, item_id: skuHit });
        matchedBySku += 1;
        continue;
      }

      // Else try pack config mapping, but only if the chosen code is unambiguous
      const packHit = variants.map((v) => codeToUniqueItemId.get(v)).find(Boolean);
      if (packHit) {
        updates.push({ id: row.id, item_id: packHit });
        matchedByPackConfig += 1;
        continue;
      }

      // If there were pack rows but ambiguous for all variants, count as ambiguous
      const anyAmbiguous = variants.some((v) => codeToItemIds.get(v)?.size && (codeToItemIds.get(v)!.size > 1));
      if (anyAmbiguous) skippedAmbiguous += 1;
    }

    // Apply updates (updates only; no upsert) in small concurrent chunks
    if (updates.length > 0) {
      const chunkSize = 25;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((u) =>
            supabase
              .from('invoice_lines')
              .update({ item_id: u.item_id })
              .eq('id', u.id)
          )
        );
        for (const r of results) {
          if (r.error) throw r.error;
        }
      }
      updated += updates.length;
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log('✅ Backfill complete\n');
  console.log(`Updated invoice_lines: ${updated}`);
  console.log(`- matched by items.sku: ${matchedBySku}`);
  console.log(`- matched by item_pack_configurations: ${matchedByPackConfig}`);
  console.log(`Skipped (no code): ${skippedNoCode}`);
  console.log(`Skipped (ambiguous): ${skippedAmbiguous}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

