/**
 * Report pack config coverage for an organization (e.g. The h.wood Group).
 *
 * Outputs:
 * - dev-output.pack-coverage.json
 *
 * Usage:
 *   npx tsx scripts/report-pack-config-coverage-hwood.ts --orgName="h.wood"
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

type ItemRow = { id: string; name: string; category: string | null; base_uom: string | null; item_type?: string | null };

async function fetchAll<T>(queryFactory: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
  let from = 0;
  const out: T[] = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as any as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function main() {
  const orgName = parseArg('orgName') || 'h.wood';
  const resolved = await resolveOrgIdFromName(orgName);
  if (!resolved) throw new Error(`No org matches orgName="${orgName}"`);

  console.log(`🏷️  Org: ${resolved.orgName} (${resolved.orgId})`);

  // Load active items for org
  console.log('Loading active items...');
  const itemRows = await fetchAll<ItemRow>(async (from, to) => {
    const res = await supabase
      .from('items')
      .select('id, name, category, base_uom, item_type')
      .eq('organization_id', resolved.orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(from, to);
    if (res.error) throw new Error(`items query failed: ${JSON.stringify(res.error)}`);
    return res as any;
  }, 1000);
  const itemIds = itemRows.map((i) => i.id);

  // Load active pack configs for those items
  const packItemIds = new Set<string>();
  {
    // Keep chunks small to avoid URL length limits
    const page = 200;
    for (let i = 0; i < itemIds.length; i += page) {
      const chunk = itemIds.slice(i, i + page);
      const { data, error } = await supabase
        .from('item_pack_configurations')
        .select('item_id')
        .in('item_id', chunk)
        .eq('is_active', true);
      if (error) throw new Error(`pack item_id IN query failed: ${JSON.stringify(error)}`);
      for (const r of data || []) packItemIds.add((r as any).item_id);
    }
  }

  const itemsMissingAnyPack = itemRows.filter((i) => !packItemIds.has(i.id));

  // Vendor aliases in org
  console.log('Loading vendor_item_aliases for org...');
  const aliases = await fetchAll<any>(async (from, to) => {
    const res = await supabase
      .from('vendor_item_aliases')
      .select('id, vendor_id, item_id, vendor_item_code, vendor_description, pack_size, is_active, vendors!inner(organization_id, name)')
      .eq('is_active', true)
      .eq('vendors.organization_id', resolved.orgId)
      .not('vendor_item_code', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (res.error) throw new Error(`vendor_item_aliases query failed: ${JSON.stringify(res.error)}`);
    return res as any;
  }, 1000);

  // For each alias, check if there is any active vendor-specific pack config for same (vendor_id, vendor_item_code)
  const aliasKeys = new Set<string>();
  for (const a of aliases || []) aliasKeys.add(`${(a as any).vendor_id}::${(a as any).vendor_item_code}`);
  const aliasKeyList = Array.from(aliasKeys);

  const packKeys = new Set<string>();
  {
    // Keep chunks small to avoid Supabase URL length limits on .in(...)
    const page = 100;
    for (let i = 0; i < aliasKeyList.length; i += page) {
      const slice = aliasKeyList.slice(i, i + page);
      // split into vendor groups to use .in('vendor_item_code', ...) with vendor_id filter
      const byVendor = new Map<string, string[]>();
      for (const key of slice) {
        const [vendorId, code] = key.split('::');
        if (!byVendor.has(vendorId)) byVendor.set(vendorId, []);
        byVendor.get(vendorId)!.push(code);
      }
      for (const [vendorId, codes] of byVendor.entries()) {
        const CODE_CHUNK = 50;
        for (let j = 0; j < codes.length; j += CODE_CHUNK) {
          const codeChunk = codes.slice(j, j + CODE_CHUNK);
          if (codeChunk.length === 0) continue;
          const { data, error } = await supabase
            .from('item_pack_configurations')
            .select('vendor_id, vendor_item_code')
            .eq('is_active', true)
            .eq('vendor_id', vendorId)
            .in('vendor_item_code', codeChunk);
          if (error) throw new Error(`pack vendor_id/code IN query failed: ${JSON.stringify(error)}`);
          for (const r of data || []) {
            packKeys.add(`${(r as any).vendor_id}::${(r as any).vendor_item_code}`);
          }
        }
      }
    }
  }

  const aliasesMissingVendorPack = (aliases || []).filter((a: any) => !packKeys.has(`${a.vendor_id}::${a.vendor_item_code}`));

  const out = {
    generated_at: new Date().toISOString(),
    org: resolved,
    totals: {
      active_items: itemRows.length,
      items_with_any_pack: packItemIds.size,
      items_missing_any_pack: itemsMissingAnyPack.length,
      active_vendor_aliases: (aliases || []).length,
      unique_vendor_code_keys: aliasKeys.size,
      alias_rows_missing_vendor_pack: aliasesMissingVendorPack.length,
    },
    samples: {
      items_missing_any_pack: itemsMissingAnyPack.slice(0, 50),
      aliases_missing_vendor_pack: aliasesMissingVendorPack
        .slice(0, 50)
        .map((a: any) => ({
          vendor_name: a.vendors?.name || null,
          vendor_id: a.vendor_id,
          vendor_item_code: a.vendor_item_code,
          item_id: a.item_id,
          vendor_description: a.vendor_description,
          pack_size: a.pack_size,
        })),
    },
  };

  const outPath = 'dev-output.pack-coverage.json';
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log('\n✅ Pack coverage report written: dev-output.pack-coverage.json');
  console.log(`- Active items: ${out.totals.active_items}`);
  console.log(`- Items missing any pack config: ${out.totals.items_missing_any_pack}`);
  console.log(`- Active vendor aliases: ${out.totals.active_vendor_aliases}`);
  console.log(`- Alias rows missing vendor pack config: ${out.totals.alias_rows_missing_vendor_pack}`);
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});

