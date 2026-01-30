/**
 * Review ALL unmatched invoice lines and suggest potential item matches.
 *
 * Unmatched = invoice_lines.item_id IS NULL
 * Excludes ignored lines (is_ignored = true) and qty <= 0 by default.
 *
 * Output:
 * - dev-output.unmatched-lines.suggestions.jsonl (one JSON per line)
 * - dev-output.unmatched-lines.grouped.json     (grouped by vendor + normalized description)
 *
 * Usage:
 *   pnpm tsx scripts/review-unmatched-invoice-lines.ts --org=<org-uuid>
 *   pnpm tsx scripts/review-unmatched-invoice-lines.ts --org=<org-uuid> --limit=5000
 *   pnpm tsx scripts/review-unmatched-invoice-lines.ts --org=<org-uuid> --includeIgnored
 *
 * Notes:
 * - Uses vendor_item_code matches first (vendor_item_aliases / item_pack_configurations)
 * - Then falls back to token-based fuzzy matching against active items in the org
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { writeFileSync, appendFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type UnmatchedLine = {
  id: string;
  description: string | null;
  vendor_item_code: string | null;
  qty: number | null;
  unit_cost: number | null;
  created_at: string;
  invoice_id: string;
  invoices: {
    id: string;
    invoice_number: string | null;
    invoice_date: string | null;
    vendor_id: string | null;
    organization_id: string;
    vendors: { id: string; name: string } | null;
    venues: { id: string; name: string } | null;
  } | null;
};

type ItemRow = {
  id: string;
  sku: string | null;
  name: string;
  category: string | null;
  base_uom: string | null;
};

type VendorAliasRow = {
  item_id: string;
  vendor_item_code: string;
};

type PackConfigRow = {
  item_id: string;
  vendor_item_code: string;
};

type Suggestion = {
  itemId: string;
  name: string;
  sku: string | null;
  score: number; // 0..1
  reasons: string[];
};

function parseArg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.split('=').slice(1).join('=').trim() || null;
}

function parseNumberArg(name: string, fallback: number): number {
  const v = parseArg(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function resolveOrgIdFromName(orgName: string): Promise<{ orgId: string; orgName: string } | null> {
  const q = orgName.trim();
  if (!q) return null;

  // Prefer exact (case-insensitive) match, else partial match.
  // We use service role so this is safe/fast and avoids relying on client JWT org_id.
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

  // If there are multiple partial matches, pick the shortest name (usually most canonical)
  // but still deterministic.
  rows.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return { orgId: rows[0].id, orgName: rows[0].name };
}

function buildCodeVariants(code: string): string[] {
  const raw = (code || '').trim();
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

function normalizeForTokens(text: string): string {
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
  'pack',
  'pk',
  'each',
  'ea',
  'loose',
  'fresh',
  'organic',
  'natural',
  'premium',
  'the',
  'and',
  'of',
  'for',
  'with',
]);

function tokens(text: string): string[] {
  const t = normalizeForTokens(text);
  if (!t) return [];
  const parts = t.split(' ').filter((p) => p.length >= 2 && !STOPWORDS.has(p));
  // uniq preserve order
  const out: string[] = [];
  for (const p of parts) if (!out.includes(p)) out.push(p);
  return out;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

function scoreByTokens(query: string, itemName: string): number {
  const qt = tokens(query);
  const it = tokens(itemName);
  const jac = jaccard(qt, it);

  const qn = normalizeForTokens(query);
  const inorm = normalizeForTokens(itemName);
  const containsBoost = qn && inorm && (inorm.includes(qn) || qn.includes(inorm)) ? 0.15 : 0;

  // mild preference for more specific overlap
  const overlapBoost = jac >= 0.5 ? 0.1 : 0;

  return Math.max(0, Math.min(1, jac + containsBoost + overlapBoost));
}

async function fetchAllUnmatchedLines(opts: {
  orgId?: string | null;
  limit?: number | null;
  includeIgnored?: boolean;
}): Promise<UnmatchedLine[]> {
  const pageSize = 1000;
  let from = 0;
  const all: UnmatchedLine[] = [];

  while (true) {
    let q = supabase
      .from('invoice_lines')
      .select(
        'id, description, vendor_item_code, qty, unit_cost, created_at, invoice_id, invoices!inner(id, invoice_number, invoice_date, vendor_id, organization_id, vendors(id, name), venues(id, name))'
      )
      .is('item_id', null);

    if (!opts.includeIgnored) {
      q = q.eq('is_ignored', false);
    }

    // Match the bulk review UI behavior: ignore non-positive qty
    q = q.gt('qty', 0);

    if (opts.orgId) {
      q = q.eq('invoices.organization_id', opts.orgId);
    }

    q = q.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data as any) {
      all.push(row as UnmatchedLine);
      if (opts.limit && all.length >= opts.limit) return all;
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function fetchOrgItems(orgId: string): Promise<ItemRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: ItemRow[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('items')
      .select('id, sku, name, category, base_uom')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as any));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function buildTokenIndex(items: ItemRow[]) {
  const itemById = new Map<string, ItemRow>();
  const itemTokens = new Map<string, string[]>();
  const tokenToItemIds = new Map<string, Set<string>>();
  const tokenDf = new Map<string, number>();

  for (const item of items) {
    itemById.set(item.id, item);
    const toks = tokens(item.name);
    itemTokens.set(item.id, toks);
    const seen = new Set<string>();
    for (const t of toks) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (!tokenToItemIds.has(t)) tokenToItemIds.set(t, new Set());
      tokenToItemIds.get(t)!.add(item.id);
    }
  }

  for (const [t, ids] of tokenToItemIds.entries()) tokenDf.set(t, ids.size);

  return { itemById, itemTokens, tokenToItemIds, tokenDf };
}

function bestFuzzySuggestions(params: {
  query: string;
  itemsIndex: ReturnType<typeof buildTokenIndex>;
  limit: number;
}): Suggestion[] {
  const { query, itemsIndex, limit } = params;
  const qt = tokens(query);
  if (qt.length === 0) return [];

  // Select up to 6 rarest query tokens to narrow candidates
  const rankedTokens = [...qt]
    .map((t) => ({ t, df: itemsIndex.tokenDf.get(t) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.df - b.df)
    .slice(0, 6)
    .map((x) => x.t);

  const candidateIds = new Set<string>();
  for (const t of rankedTokens) {
    const ids = itemsIndex.tokenToItemIds.get(t);
    if (!ids) continue;
    for (const id of ids) candidateIds.add(id);
  }

  // If nothing matched, widen to all query tokens
  if (candidateIds.size === 0) {
    for (const t of qt) {
      const ids = itemsIndex.tokenToItemIds.get(t);
      if (!ids) continue;
      for (const id of ids) candidateIds.add(id);
    }
  }

  // Worst-case fallback: still nothing => no suggestions
  if (candidateIds.size === 0) return [];

  const scored: Suggestion[] = [];
  for (const itemId of candidateIds) {
    const item = itemsIndex.itemById.get(itemId);
    if (!item) continue;
    const s = scoreByTokens(query, item.name);
    if (s <= 0) continue;
    scored.push({
      itemId,
      name: item.name,
      sku: item.sku,
      score: s,
      reasons: ['fuzzy:name_tokens'],
    });
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.slice(0, limit);
}

async function fetchVendorMappingsForLines(lines: UnmatchedLine[]) {
  // vendor -> all code variants seen on that vendor's unmatched lines
  const variantsByVendor = new Map<string, string[]>();

  for (const l of lines) {
    const vendorId = l.invoices?.vendor_id?.toString() || '';
    const code = l.vendor_item_code?.trim() || '';
    if (!vendorId || !code) continue;
    const variants = buildCodeVariants(code);
    if (variants.length === 0) continue;
    const prev = variantsByVendor.get(vendorId) || [];
    for (const v of variants) if (!prev.includes(v)) prev.push(v);
    variantsByVendor.set(vendorId, prev);
  }

  const aliasItemByVendorCode = new Map<string, string>(); // `${vendorId}::${code}` -> item_id
  const packItemIdsByVendorCode = new Map<string, Set<string>>(); // `${vendorId}::${code}` -> Set(item_id)

  for (const [vendorId, variants] of variantsByVendor.entries()) {
    const CHUNK_SIZE = 500; // avoid extremely large IN(...) lists

    // vendor_item_aliases: unique(vendor_id, vendor_item_code)
    for (let i = 0; i < variants.length; i += CHUNK_SIZE) {
      const chunk = variants.slice(i, i + CHUNK_SIZE);
      const { data: aliasRows, error: aliasErr } = await supabase
        .from('vendor_item_aliases')
        .select('item_id, vendor_item_code')
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .in('vendor_item_code', chunk);
      if (aliasErr) throw aliasErr;
      for (const r of (aliasRows || []) as any as VendorAliasRow[]) {
        aliasItemByVendorCode.set(`${vendorId}::${r.vendor_item_code}`, r.item_id);
      }
    }

    // item_pack_configurations: can have multiple item_id per vendor_item_code; keep set
    for (let i = 0; i < variants.length; i += CHUNK_SIZE) {
      const chunk = variants.slice(i, i + CHUNK_SIZE);
      const { data: packRows, error: packErr } = await supabase
        .from('item_pack_configurations')
        .select('item_id, vendor_item_code')
        .eq('vendor_id', vendorId)
        .eq('is_active', true)
        .in('vendor_item_code', chunk);
      if (packErr) throw packErr;
      for (const r of (packRows || []) as any as PackConfigRow[]) {
        const key = `${vendorId}::${r.vendor_item_code}`;
        if (!packItemIdsByVendorCode.has(key)) packItemIdsByVendorCode.set(key, new Set());
        packItemIdsByVendorCode.get(key)!.add(r.item_id);
      }
    }
  }

  return { aliasItemByVendorCode, packItemIdsByVendorCode };
}

function confidenceLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.9) return 'high';
  if (score >= 0.7) return 'medium';
  return 'low';
}

async function main() {
  const orgName = parseArg('orgName') || parseArg('org_name') || null;
  let orgId = parseArg('org');
  const limitRaw = parseArg('limit');
  const limitNum = limitRaw ? Number(limitRaw) : null;
  const limit = limitNum && Number.isFinite(limitNum) && limitNum > 0 ? limitNum : null;
  const includeIgnored = hasFlag('includeIgnored');
  const perLineSuggestions = Math.min(Math.max(parseNumberArg('top', 5), 1), 10);

  console.log('🧾 Reviewing unmatched invoice lines (with match suggestions)\n');
  if (!orgId && orgName) {
    const resolved = await resolveOrgIdFromName(orgName);
    if (!resolved) {
      console.log(`- Org name provided, but no matches found for: "${orgName}"`);
      console.log('  Tip: try a shorter keyword, or use --org=<uuid>.');
      return;
    }
    orgId = resolved.orgId;
    console.log(`- Org resolved from name: "${resolved.orgName}" (${resolved.orgId})`);
  } else if (orgId) {
    console.log(`- Org filter: ${orgId}`);
  } else {
    console.log('- Org filter: (none)  — will process all orgs found in matched invoices');
  }
  if (limit) console.log(`- Limit: ${limit}`);
  console.log(`- Include ignored: ${includeIgnored ? 'yes' : 'no'}`);
  console.log(`- Suggestions per line: ${perLineSuggestions}\n`);

  const lines = await fetchAllUnmatchedLines({ orgId, limit, includeIgnored });
  console.log(`Found ${lines.length} unmatched lines\n`);

  const orgIds = Array.from(
    new Set(lines.map((l) => l.invoices?.organization_id).filter(Boolean) as string[])
  );
  if (orgIds.length === 0) {
    console.log('No organization_id found on invoices for these lines. Exiting.');
    return;
  }

  console.log(`Loading items for ${orgIds.length} org(s)...`);
  const itemsByOrg = new Map<string, ItemRow[]>();
  for (const oid of orgIds) {
    const items = await fetchOrgItems(oid);
    itemsByOrg.set(oid, items);
    console.log(`- ${oid}: ${items.length} active items`);
  }

  console.log('\nLoading vendor code mappings (vendor_item_aliases + item_pack_configurations)...');
  const { aliasItemByVendorCode, packItemIdsByVendorCode } = await fetchVendorMappingsForLines(lines);
  console.log(`- Loaded ${aliasItemByVendorCode.size} vendor alias code matches`);
  console.log(`- Loaded ${packItemIdsByVendorCode.size} pack-config code matches\n`);

  // Prepare outputs
  const jsonlPath = 'dev-output.unmatched-lines.suggestions.jsonl';
  const groupedPath = 'dev-output.unmatched-lines.grouped.json';
  writeFileSync(jsonlPath, '', 'utf8'); // truncate

  type Group = {
    vendorId: string;
    vendorName: string;
    orgId: string;
    normalizedDescription: string;
    exampleDescription: string;
    count: number;
    sampleLines: Array<{
      lineId: string;
      invoiceNumber: string | null;
      invoiceDate: string | null;
      vendorItemCode: string | null;
      qty: number | null;
      unitCost: number | null;
    }>;
    suggestions: Suggestion[];
  };

  const groupsByVendorDesc = new Map<string, Group>(); // `${vendorId}::${norm}` -> group

  // Build token indices per org once
  const indexByOrg = new Map<string, ReturnType<typeof buildTokenIndex>>();
  for (const oid of orgIds) {
    indexByOrg.set(oid, buildTokenIndex(itemsByOrg.get(oid) || []));
  }

  let written = 0;

  for (const line of lines) {
    const desc = (line.description || '').trim();
    if (!desc) continue;

    const vendorId = line.invoices?.vendor_id || 'UNKNOWN_VENDOR';
    const vendorName = line.invoices?.vendors?.name || 'Unknown Vendor';
    const oid = line.invoices?.organization_id;
    if (!oid) continue;

    const itemsIndex = indexByOrg.get(oid);
    if (!itemsIndex) continue;

    const code = line.vendor_item_code?.trim() || '';
    const variants = code ? buildCodeVariants(code) : [];

    // Start with strong code-based candidates
    const suggestions: Suggestion[] = [];

    if (vendorId && variants.length > 0) {
      for (const v of variants) {
        const aliasHit = aliasItemByVendorCode.get(`${vendorId}::${v}`);
        if (aliasHit) {
          const item = itemsIndex.itemById.get(aliasHit);
          if (item) {
            suggestions.push({
              itemId: item.id,
              name: item.name,
              sku: item.sku,
              score: 1.0,
              reasons: ['vendor_item_aliases:code_match'],
            });
          }
        }

        const packHits = packItemIdsByVendorCode.get(`${vendorId}::${v}`);
        if (packHits && packHits.size > 0) {
          const isUnique = packHits.size === 1;
          for (const itemId of packHits) {
            const item = itemsIndex.itemById.get(itemId);
            if (!item) continue;
            suggestions.push({
              itemId: item.id,
              name: item.name,
              sku: item.sku,
              score: isUnique ? 0.95 : 0.85,
              reasons: [isUnique ? 'pack_configs:code_unique' : 'pack_configs:code_ambiguous'],
            });
          }
        }
      }
    }

    // Add fuzzy suggestions
    const fuzzy = bestFuzzySuggestions({ query: desc, itemsIndex, limit: perLineSuggestions * 3 });
    for (const f of fuzzy) suggestions.push(f);

    // Deduplicate by itemId, merge reasons, keep max score
    const merged = new Map<string, Suggestion>();
    for (const s of suggestions) {
      const prev = merged.get(s.itemId);
      if (!prev) {
        merged.set(s.itemId, { ...s, reasons: [...s.reasons] });
      } else {
        prev.score = Math.max(prev.score, s.score);
        for (const r of s.reasons) if (!prev.reasons.includes(r)) prev.reasons.push(r);
      }
    }

    const final = Array.from(merged.values())
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, perLineSuggestions);

    const payload = {
      line: {
        id: line.id,
        description: desc,
        vendor_item_code: line.vendor_item_code,
        qty: line.qty,
        unit_cost: line.unit_cost,
        created_at: line.created_at,
      },
      invoice: {
        id: line.invoice_id,
        invoice_number: line.invoices?.invoice_number || null,
        invoice_date: line.invoices?.invoice_date || null,
        vendor_id: line.invoices?.vendor_id || null,
        vendor_name: vendorName,
        venue_name: line.invoices?.venues?.name || null,
        organization_id: oid,
      },
      suggestions: final.map((s) => ({
        ...s,
        confidence: confidenceLabel(s.score),
      })),
    };

    appendFileSync(jsonlPath, JSON.stringify(payload) + '\n', 'utf8');
    written += 1;

    // Group by vendor + normalized description
    const norm = normalizeForTokens(desc);
    const groupKey = `${vendorId}::${norm}`;
    const existing = groupsByVendorDesc.get(groupKey);
    if (!existing) {
      groupsByVendorDesc.set(groupKey, {
        vendorId,
        vendorName,
        orgId: oid,
        normalizedDescription: norm,
        exampleDescription: desc,
        count: 1,
        sampleLines: [
          {
            lineId: line.id,
            invoiceNumber: line.invoices?.invoice_number || null,
            invoiceDate: line.invoices?.invoice_date || null,
            vendorItemCode: line.vendor_item_code,
            qty: line.qty,
            unitCost: line.unit_cost,
          },
        ],
        suggestions: final,
      });
    } else {
      existing.count += 1;
      if (existing.sampleLines.length < 5) {
        existing.sampleLines.push({
          lineId: line.id,
          invoiceNumber: line.invoices?.invoice_number || null,
          invoiceDate: line.invoices?.invoice_date || null,
          vendorItemCode: line.vendor_item_code,
          qty: line.qty,
          unitCost: line.unit_cost,
        });
      }
    }
  }

  // Build grouped output
  const groups = Array.from(groupsByVendorDesc.values());
  groups.sort((a, b) => b.count - a.count || a.vendorName.localeCompare(b.vendorName));

  const grouped = {
    generated_at: new Date().toISOString(),
    org_filter: orgId || null,
    include_ignored: includeIgnored,
    totals: {
      unmatched_lines_considered: written,
      vendor_description_groups: groups.length,
      vendors: Array.from(new Set(groups.map((g) => g.vendorId))).length,
    },
    groups,
  };

  writeFileSync(groupedPath, JSON.stringify(grouped, null, 2), 'utf8');

  console.log('✅ Done\n');
  console.log(`- Wrote per-line suggestions: ${jsonlPath}`);
  console.log(`- Wrote grouped review file:  ${groupedPath}`);
  console.log(`- Lines written: ${written}`);
  console.log(`- Groups: ${groups.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

