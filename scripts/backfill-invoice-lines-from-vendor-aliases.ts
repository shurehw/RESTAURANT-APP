/**
 * Backfill invoice_lines.item_id from vendor_item_aliases (vendor-specific codes).
 *
 * This complements backfill-invoice-line-item-matches.ts by using:
 *   vendor_item_aliases UNIQUE(vendor_id, vendor_item_code) -> item_id
 *
 * Safe behavior:
 * - Only updates lines where item_id IS NULL
 * - Only uses exact (or normalized-variant) code matches
 *
 * Usage:
 *   npx tsx scripts/backfill-invoice-lines-from-vendor-aliases.ts --orgName="h.wood" --dry-run
 *   npx tsx scripts/backfill-invoice-lines-from-vendor-aliases.ts --orgName="h.wood"
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

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

type LineRow = {
  id: string;
  vendor_item_code: string | null;
  invoices: { vendor_id: string | null; organization_id: string } | null;
};

type AliasRow = { vendor_item_code: string; item_id: string };

async function main() {
  const dryRun = hasFlag('dry-run');
  const orgName = parseArg('orgName') || parseArg('org_name') || null;
  const orgArg = parseArg('org') || null;
  let orgId: string | null = orgArg;

  if (!orgId) {
    const resolved = await resolveOrgIdFromName(orgName || 'h.wood');
    if (!resolved) {
      console.error(`❌ Could not resolve organization (try --org=<uuid> or --orgName=...)`);
      process.exit(1);
    }
    orgId = resolved.orgId;
    console.log(`🏷️  Org resolved: "${resolved.orgName}" (${resolved.orgId})`);
  } else {
    console.log(`🏷️  Org filter: ${orgId}`);
  }

  console.log(`🧩 Backfill invoice_lines.item_id from vendor_item_aliases (${dryRun ? 'DRY RUN' : 'APPLY'})\n`);

  const pageSize = 1000;
  let from = 0;
  let updated = 0;
  let skippedNoCode = 0;
  let skippedNoVendor = 0;
  let skippedNoAlias = 0;

  while (true) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select('id, vendor_item_code, invoices!inner(vendor_id, organization_id)')
      .is('item_id', null)
      .eq('is_ignored', false)
      .gt('qty', 0)
      .eq('invoices.organization_id', orgId)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    const rows = data as any as LineRow[];

    // Group codes by vendor for efficient lookups
    const codesByVendor = new Map<string, string[]>();
    const variantsByLineId = new Map<string, { vendorId: string; variants: string[] }>();

    for (const r of rows) {
      const vendorId = r.invoices?.vendor_id || null;
      const code = r.vendor_item_code?.trim() || '';
      if (!code) {
        skippedNoCode += 1;
        continue;
      }
      if (!vendorId) {
        skippedNoVendor += 1;
        continue;
      }
      const variants = buildCodeVariants(code);
      if (variants.length === 0) {
        skippedNoCode += 1;
        continue;
      }
      variantsByLineId.set(r.id, { vendorId, variants });
      const prev = codesByVendor.get(vendorId) || [];
      for (const v of variants) if (!prev.includes(v)) prev.push(v);
      codesByVendor.set(vendorId, prev);
    }

    // Build alias maps per vendor
    const aliasByVendorCode = new Map<string, string>(); // vendorId::code -> item_id

    for (const [vendorId, codes] of codesByVendor.entries()) {
      const CHUNK = 500;
      for (let i = 0; i < codes.length; i += CHUNK) {
        const chunk = codes.slice(i, i + CHUNK);
        const { data: aliasRows, error: aliasErr } = await supabase
          .from('vendor_item_aliases')
          .select('vendor_item_code, item_id')
          .eq('vendor_id', vendorId)
          .eq('is_active', true)
          .in('vendor_item_code', chunk);
        if (aliasErr) throw aliasErr;
        for (const a of (aliasRows || []) as any as AliasRow[]) {
          aliasByVendorCode.set(`${vendorId}::${a.vendor_item_code}`, a.item_id);
        }
      }
    }

    // Apply updates
    const updates: Array<{ id: string; item_id: string }> = [];
    for (const r of rows) {
      const info = variantsByLineId.get(r.id);
      if (!info) continue;
      const hit = info.variants.map((v) => aliasByVendorCode.get(`${info.vendorId}::${v}`)).find(Boolean);
      if (hit) updates.push({ id: r.id, item_id: hit });
      else skippedNoAlias += 1;
    }

    if (updates.length > 0) {
      if (dryRun) {
        updated += updates.length;
      } else {
        const BATCH = 50;
        for (let i = 0; i < updates.length; i += BATCH) {
          const batch = updates.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map((u) =>
              supabase
                .from('invoice_lines')
                .update({ item_id: u.item_id })
                .eq('id', u.id)
                .is('item_id', null)
            )
          );
          for (const r of results) if (r.error) throw r.error;
        }
        updated += updates.length;
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  console.log('✅ Backfill complete');
  console.log(`- ${dryRun ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`- Skipped (no code): ${skippedNoCode}`);
  console.log(`- Skipped (no vendor_id): ${skippedNoVendor}`);
  console.log(`- Skipped (no alias match): ${skippedNoAlias}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

