/**
 * Import vendor_item_aliases from a TSV/CSV (tab-separated recommended).
 *
 * Expected columns (header row required):
 * - vendor_id (required)
 * - vendor_item_code (required)
 * - item_sku (required)  -> resolves to items.id
 * - vendor_description (optional) -> falls back to example_description
 * - pack_size (optional)
 * - last_unit_cost (optional)
 *
 * Usage:
 *   npx tsx scripts/import-vendor-item-aliases-from-csv.ts path/to/file.tsv
 *
 * Notes:
 * - Upserts on (vendor_id, vendor_item_code)
 * - After import, it will backfill invoice_lines.item_id where possible (vendor_id + vendor_item_code).
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseDelimited(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('File must have a header row and at least one data row');

  // Detect delimiter: prefer tab, else comma
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.split(delim);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (parts[i] ?? '').trim();
    });
    rows.push(rec);
  }

  return { headers, rows };
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: npx tsx scripts/import-vendor-item-aliases-from-csv.ts <file.tsv>');
    process.exit(1);
  }

  const full = path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(full, 'utf8');
  const { rows } = parseDelimited(content);

  const required = ['vendor_id', 'vendor_item_code', 'item_sku'];
  for (const k of required) {
    if (!(k in rows[0])) {
      throw new Error(`Missing required column: ${k}`);
    }
  }

  // Resolve item_sku -> item_id in batches
  const skus = Array.from(new Set(rows.map((r) => r.item_sku).filter(Boolean)));
  const skuToItemId = new Map<string, string>();

  const chunkSize = 500;
  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('items')
      .select('id, sku')
      .in('sku', chunk)
      .eq('is_active', true);
    if (error) throw error;
    for (const it of data || []) skuToItemId.set(it.sku, it.id);
  }

  const upserts: any[] = [];
  let skippedMissingItem = 0;
  let skippedMissingFields = 0;

  for (const r of rows) {
    const vendorId = r.vendor_id;
    const vendorItemCode = r.vendor_item_code;
    const itemSku = r.item_sku;
    if (!vendorId || !vendorItemCode || !itemSku) {
      skippedMissingFields += 1;
      continue;
    }
    const itemId = skuToItemId.get(itemSku);
    if (!itemId) {
      skippedMissingItem += 1;
      continue;
    }
    upserts.push({
      vendor_id: vendorId,
      item_id: itemId,
      vendor_item_code: vendorItemCode,
      vendor_description: r.vendor_description || r.example_description || null,
      pack_size: r.pack_size || null,
      last_unit_cost: r.last_unit_cost ? Number(r.last_unit_cost) : null,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  console.log(`🧾 Parsed rows: ${rows.length}`);
  console.log(`Prepared alias upserts: ${upserts.length}`);
  if (skippedMissingFields) console.log(`Skipped missing required fields: ${skippedMissingFields}`);
  if (skippedMissingItem) console.log(`Skipped unknown item_sku: ${skippedMissingItem}`);

  if (upserts.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // Upsert aliases
  for (let i = 0; i < upserts.length; i += chunkSize) {
    const chunk = upserts.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('vendor_item_aliases')
      .upsert(chunk, { onConflict: 'vendor_id,vendor_item_code' });
    if (error) throw error;
  }

  console.log('✅ Imported vendor_item_aliases');

  // Backfill invoice_lines.item_id using these aliases (safe update-only)
  // We do it per vendor to keep queries small.
  const vendorIds = Array.from(new Set(upserts.map((u) => u.vendor_id)));
  let backfilled = 0;

  for (const vendorId of vendorIds) {
    const vendorCodes = upserts.filter((u) => u.vendor_id === vendorId).map((u) => u.vendor_item_code);
    for (let i = 0; i < vendorCodes.length; i += chunkSize) {
      const codesChunk = vendorCodes.slice(i, i + chunkSize);

      const { data: lines, error: linesErr } = await supabase
        .from('invoice_lines')
        .select('id, vendor_item_code, invoices!inner(vendor_id)')
        .is('item_id', null)
        .in('vendor_item_code', codesChunk)
        .eq('invoices.vendor_id', vendorId);
      if (linesErr) throw linesErr;

      if (!lines || lines.length === 0) continue;

      // For each line, resolve alias to item_id
      const { data: aliases, error: aliasErr } = await supabase
        .from('vendor_item_aliases')
        .select('vendor_item_code, item_id')
        .eq('vendor_id', vendorId)
        .in('vendor_item_code', codesChunk)
        .eq('is_active', true);
      if (aliasErr) throw aliasErr;

      const codeToItem = new Map((aliases || []).map((a) => [a.vendor_item_code, a.item_id]));
      const updates = (lines as any[])
        .map((l) => ({ id: l.id, item_id: codeToItem.get(l.vendor_item_code) }))
        .filter((u) => u.item_id);

      // Apply updates in small concurrent chunks
      const updateChunkSize = 25;
      for (let j = 0; j < updates.length; j += updateChunkSize) {
        const chunk = updates.slice(j, j + updateChunkSize);
        const results = await Promise.all(
          chunk.map((u) => supabase.from('invoice_lines').update({ item_id: u.item_id }).eq('id', u.id))
        );
        for (const r of results) {
          if (r.error) throw r.error;
        }
      }
      backfilled += updates.length;
    }
  }

  console.log(`✅ Backfilled invoice_lines.item_id for ${backfilled} line(s)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

