/**
 * Fill missing item_pack_configurations for items in an org that have NONE.
 *
 * Strategy:
 * - Infer from item name where possible:
 *   - 6/750mL, 12/1L -> case
 *   - 750mL, 1L, 1.75L, 700mL -> bottle
 *   - 5lb, 20#, 1kg, 500g -> bag
 *   - 48ct, 100ct, 15dz -> case (count-based)
 * - If cannot infer:
 *   - beverage items: default to 1x750mL bottle
 *   - others: default to 1 each
 *
 * Usage:
 *   npx tsx scripts/fill-missing-pack-configs-from-item-names.ts --orgName="h.wood"          # dry run
 *   npx tsx scripts/fill-missing-pack-configs-from-item-names.ts --orgName="h.wood" --apply
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';

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

async function resolveOrgIdFromName(orgName: string): Promise<{ orgId: string; orgName: string } | null> {
  const q = orgName.trim();
  if (!q) return null;
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(25);
  if (error) throw error;
  const rows = (data || []) as Array<{ id: string; name: string }>;
  if (rows.length === 0) return null;
  const lowerQ = q.toLowerCase();
  const exact = rows.find((r) => r.name.toLowerCase() === lowerQ);
  if (exact) return { orgId: exact.id, orgName: exact.name };
  rows.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return { orgId: rows[0].id, orgName: rows[0].name };
}

type PackType = 'case' | 'bottle' | 'bag' | 'box' | 'each' | 'keg' | 'pail' | 'drum';
type ItemRow = {
  id: string;
  name: string;
  category: string | null;
  base_uom: string | null;
  item_type: string | null;
};

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    // Split glued units like "1lbs", "750ml", "15dz", "48ct"
    .replace(/(\d)(lbs|lb|oz|ml|lt|ltr|l|kg|g|ct|dz)\b/g, '$1 $2')
    .replace(/(\d+(\.\d+)?)\s*#/g, '$1 lb')
    .replace(/\blbs\b/g, 'lb')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUom(uom: string): string {
  const u = (uom || '').toLowerCase();
  if (u === 'ml') return 'mL';
  if (u === 'l' || u === 'lt' || u === 'ltr') return 'L';
  if (u === 'gal') return 'gal';
  if (u === 'qt') return 'qt';
  if (u === 'pt') return 'pt';
  if (u === 'oz') return 'oz';
  if (u === 'lb') return 'lb';
  if (u === 'kg') return 'kg';
  if (u === 'g') return 'g';
  if (u === 'each' || u === 'ea' || u === 'unit') return 'each';
  return uom;
}

function inferFromName(name: string): null | { pack_type: PackType; units_per_pack: number; unit_size: number; unit_size_uom: string; inferred_from: string } {
  const s = normalize(name);

  // Case-only marker like "(6/Case)" with no size => assume 750mL per unit (beverage-style)
  const caseOnly = s.match(/\b(\d+)\s*\/\s*(case|cs)\b/i);
  if (caseOnly) {
    return {
      pack_type: 'case',
      units_per_pack: Number(caseOnly[1]),
      unit_size: 750,
      unit_size_uom: 'mL',
      inferred_from: 'case_only_default_750ml',
    };
  }

  // 12/750ml, 6/1l, 4/5lb, 2/1.5lb
  const casePattern = s.match(/\b(\d+)\s*\/\s*(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
  if (casePattern) {
    return {
      pack_type: 'case',
      units_per_pack: Number(casePattern[1]),
      unit_size: Number(casePattern[2]),
      unit_size_uom: normalizeUom(casePattern[4]),
      inferred_from: 'case_slash_size',
    };
  }

  // count case: 48ct, 100 ct, 200ct
  const count = s.match(/\b(\d+)\s*(ct|count)\b/i);
  if (count) {
    return {
      pack_type: 'case',
      units_per_pack: Number(count[1]),
      unit_size: 1,
      unit_size_uom: 'each',
      inferred_from: 'count_case',
    };
  }

  // dozen case: 15 dz => 180 each
  const dz = s.match(/\b(\d+)\s*dz\b/i);
  if (dz) {
    return {
      pack_type: 'case',
      units_per_pack: Number(dz[1]) * 12,
      unit_size: 1,
      unit_size_uom: 'each',
      inferred_from: 'dozen_case',
    };
  }

  // single explicit size: 750ml, 1l, 1.75l, 700ml, 28oz, 1kg, 5lb
  const size = s.match(/\b(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
  if (size) {
    const unitSize = Number(size[1]);
    const uom = normalizeUom(size[3]);
    const pack_type: PackType =
      uom === 'mL' || uom === 'L' || uom === 'oz' || uom === 'gal' || uom === 'qt' || uom === 'pt'
        ? 'bottle'
        : uom === 'lb' || uom === 'kg' || uom === 'g'
          ? 'bag'
          : 'each';
    return { pack_type, units_per_pack: 1, unit_size: unitSize, unit_size_uom: uom, inferred_from: 'single_size' };
  }

  // If name implies each/pack
  if (/\b(each|1each|ea)\b/i.test(s)) {
    return { pack_type: 'each', units_per_pack: 1, unit_size: 1, unit_size_uom: 'each', inferred_from: 'explicit_each' };
  }

  return null;
}

function isBeverageItem(item: ItemRow): boolean {
  const cat = (item.category || '').toLowerCase();
  const it = (item.item_type || '').toLowerCase();
  return it === 'beverage' || ['liquor', 'wine', 'beer', 'liqueur', 'non_alcoholic_beverage', 'bar_consumables'].includes(cat);
}

async function fetchAllItems(orgId: string): Promise<ItemRow[]> {
  const pageSize = 1000;
  let from = 0;
  const out: ItemRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('items')
      .select('id, name, category, base_uom, item_type')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as any as ItemRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function fetchItemsWithAnyPack(itemIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const page = 200;
  for (let i = 0; i < itemIds.length; i += page) {
    const chunk = itemIds.slice(i, i + page);
    const { data, error } = await supabase
      .from('item_pack_configurations')
      .select('item_id')
      .in('item_id', chunk)
      .eq('is_active', true);
    if (error) throw error;
    for (const r of data || []) out.add((r as any).item_id);
  }
  return out;
}

async function main() {
  const apply = hasFlag('apply');
  const orgName = parseArg('orgName') || 'h.wood';
  const resolved = await resolveOrgIdFromName(orgName);
  if (!resolved) throw new Error(`No org matches orgName="${orgName}"`);

  console.log(`🏷️  Org: ${resolved.orgName} (${resolved.orgId})`);
  console.log(`🔧 Fill missing pack configs from item names (${apply ? 'APPLY' : 'DRY RUN'})\n`);

  const items = await fetchAllItems(resolved.orgId);
  const withPack = await fetchItemsWithAnyPack(items.map((i) => i.id));
  const missing = items.filter((i) => !withPack.has(i.id));

  console.log(`Active items: ${items.length}`);
  console.log(`Items missing any pack config: ${missing.length}\n`);

  const inserts: any[] = [];
  const log: any[] = [];

  for (const item of missing) {
    const inferred = inferFromName(item.name);
    let pack = inferred;
    let defaulted = false;

    if (!pack) {
      defaulted = true;
      if (isBeverageItem(item)) {
        pack = { pack_type: 'bottle', units_per_pack: 1, unit_size: 750, unit_size_uom: 'mL', inferred_from: 'default_beverage_750ml' };
      } else {
        pack = { pack_type: 'each', units_per_pack: 1, unit_size: 1, unit_size_uom: 'each', inferred_from: 'default_each' };
      }
    }

    inserts.push({
      item_id: item.id,
      pack_type: pack.pack_type,
      units_per_pack: pack.units_per_pack,
      unit_size: pack.unit_size,
      unit_size_uom: pack.unit_size_uom,
      is_active: true,
    });

    log.push({
      item_id: item.id,
      name: item.name,
      category: item.category,
      item_type: item.item_type,
      base_uom: item.base_uom,
      pack: { pack_type: pack.pack_type, units_per_pack: pack.units_per_pack, unit_size: pack.unit_size, unit_size_uom: pack.unit_size_uom },
      inferred_from: pack.inferred_from,
      defaulted,
    });
  }

  writeFileSync('dev-output.pack-fill-missing.json', JSON.stringify({ generated_at: new Date().toISOString(), org: resolved, missing_count: missing.length, rows: log }, null, 2));
  console.log(`Wrote fill plan: dev-output.pack-fill-missing.json`);

  if (!apply) {
    console.log('\nSample inserts:');
    for (const r of log.slice(0, 15)) {
      console.log(`- ${r.name} -> ${r.pack.units_per_pack}/${r.pack.unit_size}${r.pack.unit_size_uom} (${r.pack.pack_type}) [${r.inferred_from}]`);
    }
    console.log(`\nWould insert: ${inserts.length}`);
    console.log('Run with --apply to write.');
    return;
  }

  // Insert in batches
  console.log('\nInserting pack configs...');
  const BATCH = 100;
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error } = await supabase.from('item_pack_configurations').insert(batch);
    if (error) {
      failed += batch.length;
      console.warn(`⚠️  Batch insert failed @${i}: ${error.message}`);
    } else {
      inserted += batch.length;
      if (inserted % 500 === 0 || inserted === inserts.length) {
        console.log(`  ✅ Inserted ${inserted}/${inserts.length}...`);
      }
    }
  }

  console.log(`\n✅ Done. Inserted: ${inserted} | Failed: ${failed}`);
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});

