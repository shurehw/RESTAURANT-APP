/**
 * Audit + (optional) fix R365 readiness for The h.wood Group.
 *
 * Covers:
 * - Items export to R365 (purchase item import): r365_* fields, SKU, subcategory, gl_account_id -> gl_accounts.external_code, pack configs
 * - AP export readiness: approved invoices missing vendor/venue R365 IDs or any line missing gl_code
 *
 * Usage:
 *   npx tsx scripts/audit-and-fix-r365-readiness-hwood.ts --orgName="h.wood"
 *   npx tsx scripts/audit-and-fix-r365-readiness-hwood.ts --orgName="h.wood" --apply
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

type ItemRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  base_uom: string | null;
  item_type: string | null;
  gl_account_id: string | null;
  r365_measure_type: string | null;
  r365_reporting_uom: string | null;
  r365_inventory_uom: string | null;
  r365_cost_account: string | null;
  r365_inventory_account: string | null;
  r365_cost_update_method: string | null;
  r365_key_item: boolean | null;
  item_pack_configurations?: any[];
  gl_accounts?: { external_code: string | null; name: string | null } | null;
};

const VALID_MEASURE_TYPES = new Set(['Each', 'Weight', 'Volume']);
const VALID_UOMS = new Set(['Each', 'LB', 'L', 'OZ', 'KG', 'G']);

function isBlank(v: any): boolean {
  return v === null || v === undefined || String(v).trim() === '';
}

function inferMeasureType(item: ItemRow): 'Each' | 'Weight' | 'Volume' {
  const u = (item.base_uom || '').toLowerCase().trim();
  if (['each', 'unit'].includes(u)) return 'Each';
  if (['lb', 'oz', 'g', 'kg'].includes(u)) return 'Weight';
  if (['ml', 'l', 'gal', 'qt', 'pt'].includes(u)) return 'Volume';

  // fallback from category/item_type
  const cat = (item.category || '').toLowerCase();
  const it = (item.item_type || '').toLowerCase();
  if (it === 'beverage' || ['liquor', 'wine', 'beer', 'non_alcoholic_beverage'].includes(cat)) return 'Volume';
  return 'Each';
}

function measureTypeToUom(mt: 'Each' | 'Weight' | 'Volume', baseUom: string | null): string {
  const b = (baseUom || '').toLowerCase().trim();
  if (mt === 'Each') return 'Each';
  if (mt === 'Volume') return 'L';
  // Weight: keep more precise when obvious
  if (b === 'oz') return 'OZ';
  if (b === 'g') return 'G';
  if (b === 'kg') return 'KG';
  return 'LB';
}

function normalizeExistingUom(uom: string | null, mt: 'Each' | 'Weight' | 'Volume', baseUom: string | null): string {
  const raw = String(uom || '').trim();
  if (!raw) return measureTypeToUom(mt, baseUom);
  if (VALID_UOMS.has(raw)) return raw;
  // Common bad values like "750ml", "1L", "1lb"
  const lower = raw.toLowerCase();
  if (lower.includes('ml') || lower.includes('l')) return 'L';
  if (lower.includes('lb') || lower.includes('#')) return 'LB';
  if (lower.includes('oz')) return 'OZ';
  if (lower.includes('kg')) return 'KG';
  if (lower.includes('g')) return 'G';
  if (lower.includes('each') || lower.includes('ea') || lower.includes('unit')) return 'Each';
  return measureTypeToUom(mt, baseUom);
}

function deriveAccounts(category: string | null): { cost: string; inventory: string } {
  const cat = (category || '').toLowerCase();
  if (cat.includes('meat')) return { cost: 'Meat Cost', inventory: 'Meat Inventory' };
  if (cat.includes('seafood')) return { cost: 'Seafood Cost', inventory: 'Seafood Inventory' };
  if (cat.includes('produce')) return { cost: 'Produce Cost', inventory: 'Produce Inventory' };
  if (cat.includes('dairy')) return { cost: 'Dairy Cost', inventory: 'Dairy Inventory' };
  if (cat.includes('grocery') || cat.includes('pantry')) return { cost: 'Grocery Cost', inventory: 'Grocery Inventory' };
  if (cat.includes('bakery')) return { cost: 'Bakery Cost', inventory: 'Bakery Inventory' };
  if (cat.includes('beer')) return { cost: 'Beer Cost', inventory: 'Beer Inventory' };
  if (cat.includes('wine')) return { cost: 'Wine Cost', inventory: 'Wine Inventory' };
  if (cat.includes('liquor') || cat.includes('spirit') || cat.includes('liqueur')) return { cost: 'Liquor Cost', inventory: 'Liquor Inventory' };
  return { cost: 'Food Cost', inventory: 'Food Inventory' };
}

function inferSubcategory(item: ItemRow): string {
  const cat = (item.category || '').toLowerCase().trim();
  if (cat === 'meat') return 'meat_protein';
  if (cat === 'seafood') return 'seafood';
  if (cat === 'produce') return 'produce';
  if (cat === 'dairy') return 'dairy';
  if (cat === 'bakery') return 'bakery';
  if (cat === 'grocery' || cat === 'pantry' || cat === 'food') return 'dry_goods';

  if (cat === 'beer') return 'beer';
  if (cat === 'wine') return 'wine';
  if (cat === 'liquor' || cat === 'liqueur' || cat === 'spirits') return 'spirits';
  if (cat === 'bar_consumables') return 'mixer';
  if (cat === 'non_alcoholic_beverage') return 'na_beverage';

  if (cat === 'packaging' || cat === 'supplies') return 'supplies';
  return 'misc';
}

function inferGlExternalCode(item: ItemRow): string | null {
  const cat = (item.category || '').toLowerCase().trim();
  // COGS
  if (cat === 'meat') return '5110';
  if (cat === 'seafood') return '5120';
  if (cat === 'produce') return '5140';
  if (cat === 'dairy') return '5150';
  if (cat === 'bakery') return '5160';
  if (cat === 'grocery' || cat === 'pantry') return '5170';
  if (cat === 'food') return '5100';

  if (cat === 'liquor' || cat === 'liqueur' || cat === 'spirits') return '5310';
  if (cat === 'wine') return '5320';
  if (cat === 'beer') return '5330';
  if (cat === 'bar_consumables') return '5315';
  if (cat === 'non_alcoholic_beverage') return '5335';

  // Opex (best-effort defaults)
  if (cat === 'packaging' || cat === 'supplies') return '7220'; // Kitchen Supplies
  return null;
}

async function fetchAllItems(orgId: string): Promise<ItemRow[]> {
  const pageSize = 1000;
  let from = 0;
  const out: ItemRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('items')
      .select(
        'id,name,sku,category,subcategory,base_uom,item_type,gl_account_id,r365_measure_type,r365_reporting_uom,r365_inventory_uom,r365_cost_account,r365_inventory_account,r365_cost_update_method,r365_key_item,item_pack_configurations(id),gl_accounts(external_code,name)'
      )
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as any));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function fetchApprovedInvoices(orgId: string) {
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('invoices')
      .select('id,invoice_number,invoice_date,status,r365_export_batch_id,venue:venues(r365_entity_id),vendor:vendors(r365_vendor_id),invoice_lines(gl_code)')
      .eq('organization_id', orgId)
      .eq('status', 'approved')
      .is('r365_export_batch_id', null)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function main() {
  const apply = hasFlag('apply');
  const orgName = parseArg('orgName') || 'h.wood';
  const resolved = await resolveOrgIdFromName(orgName);
  if (!resolved) throw new Error(`No org matches orgName="${orgName}"`);

  console.log(`🏷️  Org: ${resolved.orgName} (${resolved.orgId})`);
  console.log(`Mode: ${apply ? 'APPLY FIXES' : 'AUDIT ONLY'}\n`);

  const items = await fetchAllItems(resolved.orgId);

  // SKU uniqueness
  const skuCounts = new Map<string, number>();
  for (const i of items) {
    const sku = (i.sku || '').trim();
    if (!sku) continue;
    skuCounts.set(sku, (skuCounts.get(sku) || 0) + 1);
  }
  const duplicateSkus = Array.from(skuCounts.entries()).filter(([, c]) => c > 1);

  const missing: Record<string, string[]> = {
    sku: [],
    pack_configs: [],
    subcategory: [],
    gl_account: [],
    gl_external_code: [],
    r365_measure_type: [],
    r365_reporting_uom: [],
    r365_inventory_uom: [],
    r365_cost_account: [],
    r365_inventory_account: [],
    r365_cost_update_method: [],
  };

  const invalid: Record<string, string[]> = {
    r365_measure_type: [],
    r365_reporting_uom: [],
    r365_inventory_uom: [],
  };

  const updatesPlanned: Array<{ id: string; update: any; name: string }> = [];
  const subcategoryPlanned: Array<{ id: string; newSubcategory: string; name: string }> = [];
  const glPlanned: Array<{ id: string; gl_account_id: string; gl_external_code: string; name: string }> = [];

  for (const item of items) {
    const packCount = (item as any).item_pack_configurations?.length || 0;
    const gl = (item as any).gl_accounts;

    if (isBlank(item.sku)) missing.sku.push(item.id);
    if (packCount === 0) missing.pack_configs.push(item.id);
    if (isBlank(item.subcategory)) missing.subcategory.push(item.id);
    if (isBlank(item.gl_account_id)) missing.gl_account.push(item.id);
    if (!gl?.external_code) missing.gl_external_code.push(item.id);

    if (isBlank(item.r365_measure_type)) missing.r365_measure_type.push(item.id);
    else if (!VALID_MEASURE_TYPES.has(item.r365_measure_type)) invalid.r365_measure_type.push(item.id);

    if (isBlank(item.r365_reporting_uom)) missing.r365_reporting_uom.push(item.id);
    else if (!VALID_UOMS.has(String(item.r365_reporting_uom))) invalid.r365_reporting_uom.push(item.id);

    if (isBlank(item.r365_inventory_uom)) missing.r365_inventory_uom.push(item.id);
    else if (!VALID_UOMS.has(String(item.r365_inventory_uom))) invalid.r365_inventory_uom.push(item.id);

    if (isBlank(item.r365_cost_account)) missing.r365_cost_account.push(item.id);
    if (isBlank(item.r365_inventory_account)) missing.r365_inventory_account.push(item.id);
    if (isBlank(item.r365_cost_update_method)) missing.r365_cost_update_method.push(item.id);

    // Plan safe R365 field fixes (only fill missing/invalid, never overwrite valid)
    const mt = inferMeasureType(item);
    const desiredMeasureType =
      isBlank(item.r365_measure_type) || !VALID_MEASURE_TYPES.has(String(item.r365_measure_type))
        ? mt
        : (item.r365_measure_type as any);

    const desiredReporting = normalizeExistingUom(item.r365_reporting_uom, desiredMeasureType, item.base_uom);
    const desiredInventory = normalizeExistingUom(item.r365_inventory_uom, desiredMeasureType, item.base_uom);
    const accounts = deriveAccounts(item.category);

    const update: any = {};
    if (isBlank(item.r365_measure_type) || !VALID_MEASURE_TYPES.has(String(item.r365_measure_type))) {
      update.r365_measure_type = desiredMeasureType;
    }
    if (isBlank(item.r365_reporting_uom) || !VALID_UOMS.has(String(item.r365_reporting_uom))) {
      update.r365_reporting_uom = desiredReporting;
    }
    if (isBlank(item.r365_inventory_uom) || !VALID_UOMS.has(String(item.r365_inventory_uom))) {
      update.r365_inventory_uom = desiredInventory;
    }
    if (isBlank(item.r365_cost_account)) update.r365_cost_account = accounts.cost;
    if (isBlank(item.r365_inventory_account)) update.r365_inventory_account = accounts.inventory;
    if (isBlank(item.r365_cost_update_method)) update.r365_cost_update_method = 'Average';
    if (item.r365_key_item === null || item.r365_key_item === undefined) update.r365_key_item = false;

    if (Object.keys(update).length > 0) {
      updatesPlanned.push({ id: item.id, update, name: item.name });
    }
  }

  // Plan subcategory + GL mapping fixes (best-effort, no RPC dependency)
  if (apply) {
    for (const item of items) {
      if (isBlank(item.subcategory)) {
        subcategoryPlanned.push({ id: item.id, newSubcategory: inferSubcategory(item), name: item.name });
      }
    }
  }

  // Apply fixes
  let updatedItems = 0;
  let updatedSubcats = 0;
  let updatedGl = 0;
  const errors: Array<{ id: string; error: string }> = [];

  if (apply) {
    // Apply r365_* updates
    for (let i = 0; i < updatesPlanned.length; i += 50) {
      const batch = updatesPlanned.slice(i, i + 50);
      const results = await Promise.all(
        batch.map((u) =>
          supabase.from('items').update(u.update).eq('id', u.id)
        )
      );
      for (let k = 0; k < results.length; k++) {
        const r = results[k];
        if (r.error) errors.push({ id: batch[k].id, error: r.error.message });
        else updatedItems += 1;
      }
    }

    // Apply subcategories
    for (const s of subcategoryPlanned) {
      const { error } = await supabase.from('items').update({ subcategory: s.newSubcategory }).eq('id', s.id);
      if (error) errors.push({ id: s.id, error: error.message });
      else updatedSubcats += 1;
    }

    // Build GL external_code -> id map for org
    const { data: glAccounts, error: glErr } = await supabase
      .from('gl_accounts')
      .select('id, external_code')
      .eq('org_id', resolved.orgId)
      .eq('is_active', true)
      .not('external_code', 'is', null)
      .limit(5000);
    if (glErr) throw glErr;
    const glByCode = new Map<string, string>();
    for (const ga of glAccounts || []) glByCode.set((ga as any).external_code, (ga as any).id);

    const needGl = items.filter((i) => !i.gl_account_id);
    for (const item of needGl) {
      const code = inferGlExternalCode(item);
      if (!code) continue;
      const glId = glByCode.get(code);
      if (!glId) continue;
      glPlanned.push({ id: item.id, gl_account_id: glId, gl_external_code: code, name: item.name });
    }

    for (const g of glPlanned) {
      const { error } = await supabase.from('items').update({ gl_account_id: g.gl_account_id }).eq('id', g.id);
      if (error) errors.push({ id: g.id, error: error.message });
      else updatedGl += 1;
    }

    // Backfill invoice_lines.gl_code for mapped lines missing gl_code (org-scoped)
    // This makes AP export deterministic (export route skips lines with missing gl_code).
    try {
      const pageSize = 1000;
      let from = 0;
      let fixedGlLines = 0;
      while (true) {
        const { data, error } = await supabase
          .from('invoice_lines')
          .select('id,item_id,invoices!inner(organization_id)')
          .eq('invoices.organization_id', resolved.orgId)
          .is('gl_code', null)
          .not('item_id', 'is', null)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        const lineRows = data as any[];
        const itemIds = Array.from(new Set(lineRows.map((r) => r.item_id)));
        const { data: itemGl, error: itemErr } = await supabase
          .from('items')
          .select('id, gl_accounts(external_code)')
          .in('id', itemIds);
        if (itemErr) throw itemErr;
        const codeByItem = new Map<string, string>();
        for (const r of itemGl || []) {
          const code = (r as any).gl_accounts?.external_code;
          if (code) codeByItem.set((r as any).id, code);
        }
        const updates = lineRows
          .map((r) => ({ id: r.id, gl_code: codeByItem.get(r.item_id) || null }))
          .filter((u) => !!u.gl_code);
        for (let i = 0; i < updates.length; i += 50) {
          const batch = updates.slice(i, i + 50);
          const results = await Promise.all(
            batch.map((u) => supabase.from('invoice_lines').update({ gl_code: u.gl_code }).eq('id', u.id))
          );
          for (const rr of results) if (rr.error) throw rr.error;
          fixedGlLines += batch.length;
        }
        if (lineRows.length < pageSize) break;
        from += pageSize;
      }
      // eslint-disable-next-line no-console
      console.log(`\n✓ Backfilled invoice_lines.gl_code rows: ${fixedGlLines}`);
    } catch (e: any) {
      errors.push({ id: 'invoice_lines_gl_code', error: e?.message || String(e) });
    }
  }

  // AP export readiness audit
  const approved = await fetchApprovedInvoices(resolved.orgId);
  const apIssues = {
    approved_unexported_invoices: approved.length,
    missing_vendor_r365_vendor_id: approved.filter((i) => !i.vendor?.r365_vendor_id).length,
    missing_venue_r365_entity_id: approved.filter((i) => !i.venue?.r365_entity_id).length,
    missing_invoice_number: approved.filter((i) => !i.invoice_number).length,
    missing_invoice_date: approved.filter((i) => !i.invoice_date).length,
    invoices_with_any_missing_gl_code: approved.filter((i) => (i.invoice_lines || []).some((l: any) => !l.gl_code)).length,
  };

  const report = {
    generated_at: new Date().toISOString(),
    org: resolved,
    items: {
      active: items.length,
      duplicate_skus: duplicateSkus.slice(0, 50),
      missing_counts: Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, v.length])),
      invalid_counts: Object.fromEntries(Object.entries(invalid).map(([k, v]) => [k, v.length])),
      planned_updates: apply ? updatesPlanned.length : undefined,
      applied_updates: apply ? { r365_fields: updatedItems, subcategories: updatedSubcats, gl_account_id: updatedGl } : undefined,
    },
    ap_export: apIssues,
    errors: errors.slice(0, 50),
  };

  const outPath = 'dev-output.r365-readiness.json';
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n✅ Wrote report: dev-output.r365-readiness.json');
  console.log('\nItem field gaps (counts):');
  for (const [k, v] of Object.entries(report.items.missing_counts)) {
    if (v) console.log(`- ${k}: ${v}`);
  }
  for (const [k, v] of Object.entries(report.items.invalid_counts)) {
    if (v) console.log(`- invalid ${k}: ${v}`);
  }
  console.log('\nAP export blockers (approved + unexported):');
  console.log(report.ap_export);
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});

