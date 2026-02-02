/**
 * COGS-focused data audit for an organization (Hwood).
 *
 * Produces:
 * - dev-output.cogs-audit.json
 *
 * Focus areas:
 * - Item taxonomy: category/subcategory/item_type sanity
 * - GL mapping: items.gl_account_id + gl_accounts.external_code distribution and mismatches
 * - Pack configs: structural validity and conversion_factor consistency
 * - R365 fields: measure type + UOM coherence (should already be fixed)
 * - Invoice lines: mapping coverage + gl_code consistency with item GL
 *
 * Usage:
 *   npx tsx scripts/cogs-data-audit-hwood.ts --orgName="h.wood"
 *   npx tsx scripts/cogs-data-audit-hwood.ts --org="13dacb8a-d2b5-42b8-bcc3-50bc372c0a41"
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

function round(n: number, d = 4): number {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

function isBlank(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  item_type: string | null;
  base_uom: string | null;
  gl_account_id: string | null;
  r365_measure_type: string | null;
  r365_reporting_uom: string | null;
  r365_inventory_uom: string | null;
  r365_cost_account: string | null;
  r365_inventory_account: string | null;
  r365_cost_update_method: string | null;
  r365_key_item: boolean | null;
};

type GlRow = { id: string; external_code: string | null; name: string | null; section: string | null };

type PackRow = {
  id: string;
  item_id: string;
  pack_type: string;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
  conversion_factor: number;
  vendor_id: string | null;
  vendor_item_code: string | null;
  display_name: string | null;
  is_active: boolean;
};

type InvoiceLineRow = {
  id: string;
  item_id: string | null;
  gl_code: string | null;
  description: string | null;
  qty: number | null;
  unit_cost: number | null;
  line_total: number | null;
  invoice_id: string;
  invoices: { organization_id: string; invoice_date: string | null; status: string | null } | null;
};

function calcConversionFactor(unitsPerPack: number, unitSize: number, unitUom: string, baseUom: string): number {
  const u = unitUom;
  const b = baseUom;
  const total = unitsPerPack * unitSize;

  // Volume
  if (u === 'mL' && b === 'oz') return round(total * 0.033814);
  if (u === 'L' && b === 'oz') return round(total * 33.814);
  if (u === 'mL' && b === 'L') return round(total / 1000);
  if (u === 'L' && b === 'mL') return round(total * 1000);
  if (u === 'gal' && b === 'oz') return round(total * 128);
  if (u === 'qt' && b === 'oz') return round(total * 32);
  if (u === 'pt' && b === 'oz') return round(total * 16);

  // Weight
  if (u === 'lb' && b === 'oz') return round(total * 16);
  if (u === 'oz' && b === 'lb') return round(total / 16);
  if (u === 'kg' && b === 'lb') return round(total * 2.20462);
  if (u === 'g' && b === 'oz') return round(total * 0.035274);

  // Same unit
  if (u === b) return round(total);

  // Unknown: return raw total
  return round(total);
}

async function fetchAll<T>(factory: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>, pageSize = 1000): Promise<T[]> {
  let from = 0;
  const out: T[] = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await factory(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as any));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function countBy<T>(rows: T[], keyFn: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = keyFn(r) || 'NULL';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function topN(map: Record<string, number>, n = 20): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);
}

async function main() {
  const orgArg = parseArg('org');
  const orgName = parseArg('orgName') || 'h.wood';
  const resolved = orgArg ? { orgId: orgArg, orgName: '(by id)' } : await resolveOrgIdFromName(orgName);
  if (!resolved) throw new Error(`No org matches orgName="${orgName}"`);

  console.log(`🏷️  Org: ${resolved.orgName} (${resolved.orgId})`);
  console.log('Loading items/gl/pack configs...');

  const items = await fetchAll<ItemRow>((from, to) =>
    supabase
      .from('items')
      .select('id,name,sku,category,subcategory,item_type,base_uom,gl_account_id,r365_measure_type,r365_reporting_uom,r365_inventory_uom,r365_cost_account,r365_inventory_account,r365_cost_update_method,r365_key_item')
      .eq('organization_id', resolved.orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(from, to)
  );

  const glAccounts = await fetchAll<GlRow>((from, to) =>
    supabase
      .from('gl_accounts')
      .select('id,external_code,name,section')
      .eq('org_id', resolved.orgId)
      .eq('is_active', true)
      .range(from, to)
  );
  const glById = new Map(glAccounts.map((g) => [g.id, g]));

  const packConfigs = await fetchAll<PackRow>((from, to) =>
    supabase
      .from('item_pack_configurations')
      .select('id,item_id,pack_type,units_per_pack,unit_size,unit_size_uom,conversion_factor,vendor_id,vendor_item_code,display_name,is_active')
      .eq('is_active', true)
      .range(from, to)
  );

  const packByItem = new Map<string, PackRow[]>();
  for (const p of packConfigs) {
    if (!packByItem.has(p.item_id)) packByItem.set(p.item_id, []);
    packByItem.get(p.item_id)!.push(p);
  }

  // Invoice line stats: use counts + sample
  const { count: totalLines } = await supabase
    .from('invoice_lines')
    .select('id, invoices!inner(organization_id)', { count: 'exact', head: true })
    .eq('invoices.organization_id', resolved.orgId);

  const { count: unmappedLines } = await supabase
    .from('invoice_lines')
    .select('id, invoices!inner(organization_id)', { count: 'exact', head: true })
    .eq('invoices.organization_id', resolved.orgId)
    .is('item_id', null)
    .eq('is_ignored', false)
    .gt('qty', 0);

  const { count: mappedNoGl } = await supabase
    .from('invoice_lines')
    .select('id, invoices!inner(organization_id)', { count: 'exact', head: true })
    .eq('invoices.organization_id', resolved.orgId)
    .not('item_id', 'is', null)
    .is('gl_code', null);

  const sampleProblemLines = await fetchAll<InvoiceLineRow>((from, to) =>
    supabase
      .from('invoice_lines')
      .select('id,item_id,gl_code,description,qty,unit_cost,line_total,invoice_id,invoices!inner(organization_id,invoice_date,status)')
      .eq('invoices.organization_id', resolved.orgId)
      .or('item_id.is.null,gl_code.is.null')
      .limit(500)
      .range(from, to)
  , 500);

  // Item taxonomy / mapping checks
  const missingSku = items.filter((i) => isBlank(i.sku));
  const missingSubcategory = items.filter((i) => isBlank(i.subcategory));
  const missingGl = items.filter((i) => isBlank(i.gl_account_id));
  const glMissingExternal = items.filter((i) => i.gl_account_id && !glById.get(i.gl_account_id)?.external_code);

  const byCategory = countBy(items, (i) => (i.category || 'NULL').toLowerCase());
  const bySubcategory = countBy(items, (i) => (i.subcategory || 'NULL').toLowerCase());
  const byItemType = countBy(items, (i) => (i.item_type || 'NULL').toLowerCase());
  const byGlCode = countBy(items, (i) => glById.get(i.gl_account_id || '')?.external_code || 'NULL');

  // Pack config integrity checks
  const packIssues: any[] = [];
  const placeholderPacks: any[] = [];
  const convMismatch: any[] = [];
  const uomCaseIssues: any[] = [];
  const allowedPackTypes = new Set(['case', 'bottle', 'bag', 'box', 'each', 'keg', 'pail', 'drum']);
  const allowedUoms = new Set(['mL', 'L', 'oz', 'lb', 'g', 'kg', 'gal', 'qt', 'pt', 'each', 'ml', 'l']);

  const itemById = new Map(items.map((i) => [i.id, i]));

  for (const p of packConfigs) {
    if (!allowedPackTypes.has(p.pack_type)) {
      packIssues.push({ type: 'invalid_pack_type', pack_id: p.id, item_id: p.item_id, pack_type: p.pack_type });
    }
    if (!allowedUoms.has(p.unit_size_uom)) {
      packIssues.push({ type: 'invalid_unit_size_uom', pack_id: p.id, item_id: p.item_id, unit_size_uom: p.unit_size_uom });
    }

    // placeholders
    if (
      p.pack_type === 'each' &&
      Number(p.units_per_pack) === 1 &&
      Number(p.unit_size) === 1 &&
      (p.unit_size_uom === 'each' || p.unit_size_uom === 'Each')
    ) {
      placeholderPacks.push({ pack_id: p.id, item_id: p.item_id, vendor_id: p.vendor_id, vendor_item_code: p.vendor_item_code });
    }

    const item = itemById.get(p.item_id);
    if (!item || !item.base_uom) continue;
    const expected = calcConversionFactor(
      Number(p.units_per_pack),
      Number(p.unit_size),
      String(p.unit_size_uom),
      String(item.base_uom)
    );
    const actual = round(Number(p.conversion_factor));
    const delta = Math.abs(expected - actual);
    if (delta > 0.01) {
      convMismatch.push({
        pack_id: p.id,
        item_id: p.item_id,
        base_uom: item.base_uom,
        units_per_pack: p.units_per_pack,
        unit_size: p.unit_size,
        unit_size_uom: p.unit_size_uom,
        expected,
        actual,
        delta,
      });
    }

    // unit_size_uom casing (ml vs mL, l vs L) for R365 friendliness
    if (p.unit_size_uom === 'ml' || p.unit_size_uom === 'l') {
      uomCaseIssues.push({ pack_id: p.id, item_id: p.item_id, unit_size_uom: p.unit_size_uom });
    }
  }

  // GL mapping vs category heuristics (COGS analyst sanity)
  const categoryGlAnomalies: any[] = [];
  const expectedGlByCategory: Record<string, string[]> = {
    meat: ['5110'],
    seafood: ['5120'],
    produce: ['5140'],
    dairy: ['5150'],
    bakery: ['5160'],
    grocery: ['5170'],
    pantry: ['5170'],
    food: ['5100', '5110', '5120', '5140', '5150', '5160', '5170'],
    liquor: ['5310'],
    liqueur: ['5310'],
    wine: ['5320'],
    beer: ['5330'],
    bar_consumables: ['5315'],
    non_alcoholic_beverage: ['5335'],
    supplies: ['7220', '7219', '7140'],
    packaging: ['7220', '7219', '7140'],
  };

  for (const item of items) {
    const cat = (item.category || '').toLowerCase().trim();
    const gl = glById.get(item.gl_account_id || '')?.external_code || null;
    if (!cat || !gl) continue;
    const expected = expectedGlByCategory[cat];
    if (expected && !expected.includes(gl)) {
      categoryGlAnomalies.push({ item_id: item.id, name: item.name, category: item.category, gl_code: gl, expected });
    }
  }

  // R365 field coherence checks
  const r365Issues: any[] = [];
  const validMeasureTypes = new Set(['Each', 'Weight', 'Volume']);
  const validUomsR365 = new Set(['Each', 'LB', 'L', 'OZ', 'KG', 'G']);
  for (const item of items) {
    if (!validMeasureTypes.has(String(item.r365_measure_type || ''))) {
      r365Issues.push({ type: 'invalid_measure_type', item_id: item.id, value: item.r365_measure_type });
    }
    if (!validUomsR365.has(String(item.r365_reporting_uom || ''))) {
      r365Issues.push({ type: 'invalid_reporting_uom', item_id: item.id, value: item.r365_reporting_uom });
    }
    if (!validUomsR365.has(String(item.r365_inventory_uom || ''))) {
      r365Issues.push({ type: 'invalid_inventory_uom', item_id: item.id, value: item.r365_inventory_uom });
    }
  }

  // Output report
  const report = {
    generated_at: new Date().toISOString(),
    org: resolved,
    totals: {
      items_active: items.length,
      gl_accounts_active: glAccounts.length,
      pack_configs_active: packConfigs.length,
      invoice_lines_total: totalLines || 0,
      invoice_lines_unmapped_active: unmappedLines || 0,
      invoice_lines_mapped_missing_gl_code: mappedNoGl || 0,
    },
    distributions: {
      category_top: topN(byCategory, 50),
      subcategory_top: topN(bySubcategory, 50),
      item_type_top: topN(byItemType, 20),
      gl_code_top: topN(byGlCode, 50),
    },
    critical: {
      items_missing_sku: missingSku.length,
      items_missing_subcategory: missingSubcategory.length,
      items_missing_gl_account_id: missingGl.length,
      items_gl_missing_external_code: glMissingExternal.length,
      pack_conversion_mismatches: convMismatch.length,
      pack_invalids: packIssues.length,
      invoice_lines_unmapped_active: unmappedLines || 0,
    },
    findings: {
      pack_invalids: packIssues.slice(0, 200),
      pack_conversion_mismatches: convMismatch.sort((a, b) => b.delta - a.delta).slice(0, 200),
      pack_uom_casing_issues: uomCaseIssues.slice(0, 200),
      placeholder_pack_configs: placeholderPacks.slice(0, 200),
      category_gl_anomalies: categoryGlAnomalies.slice(0, 200),
      r365_issues: r365Issues.slice(0, 200),
      sample_problem_invoice_lines: sampleProblemLines.slice(0, 200),
    },
    notes: [
      'Placeholder pack configs are structurally valid but may need refinement for accurate conversions.',
      'Category vs GL anomalies are heuristics for COGS sanity; some may be intentional.',
    ],
  };

  writeFileSync('dev-output.cogs-audit.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('\n✅ Wrote dev-output.cogs-audit.json');
  console.log(`- Items: ${report.totals.items_active}`);
  console.log(`- Pack configs: ${report.totals.pack_configs_active}`);
  console.log(`- Invoice lines unmapped (active): ${report.totals.invoice_lines_unmapped_active}`);
  console.log(`- Pack conversion mismatches: ${report.critical.pack_conversion_mismatches}`);
  console.log(`- Category↔GL anomalies (heuristic): ${categoryGlAnomalies.length}`);
  console.log(`- Placeholder pack configs: ${placeholderPacks.length}`);
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});

