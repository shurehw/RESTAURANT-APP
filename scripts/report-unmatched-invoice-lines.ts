/**
 * Report unmatched invoice lines (item_id IS NULL)
 *
 * Outputs:
 * - Totals
 * - Unmatched lines by vendor (counts, % with vendor_item_code)
 * - Top unmatched descriptions per vendor
 * - Lines that HAVE vendor_item_code but still didn't match (good candidates for alias learning)
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Row = {
  id: string;
  description: string | null;
  vendor_item_code: string | null;
  unit_cost: number | null;
  qty: number | null;
  line_total: number | null;
  created_at: string;
  invoice_id: string;
  invoices: {
    id: string;
    vendor_id: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    vendors: { id: string; name: string; is_active: boolean } | null;
  } | null;
};

function normDesc(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/[,().]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchCount(table: string, filter: (q: any) => any): Promise<number> {
  const { count, error } = await filter(
    supabase.from(table).select('id', { count: 'exact', head: true })
  );
  if (error) throw error;
  return count || 0;
}

async function main() {
  console.log('🔎 Reporting unmatched invoice lines (item_id is null)\n');

  const totalLines = await fetchCount('invoice_lines', (q) => q);
  const totalUnmatched = await fetchCount('invoice_lines', (q) => q.is('item_id', null));

  console.log(`Total invoice lines: ${totalLines}`);
  console.log(`Unmatched invoice lines: ${totalUnmatched}\n`);

  // Pull unmatched lines with vendor context
  const pageSize = 1000;
  let from = 0;
  let all: Row[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select(
        'id, description, vendor_item_code, unit_cost, qty, line_total, created_at, invoice_id, invoices(id, vendor_id, invoice_number, invoice_date, vendors(id, name, is_active))'
      )
      .is('item_id', null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all = all.concat(data as any);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Group by vendor
  const byVendor = new Map<
    string,
    {
      vendorId: string;
      vendorName: string;
      inactiveVendor: boolean;
      count: number;
      withCode: number;
      topDescs: Map<string, { rawExample: string; count: number }>;
      codedExamples: Array<{
        invoiceNumber: string | null;
        code: string;
        description: string;
      }>;
    }
  >();

  for (const r of all) {
    const vendor = r.invoices?.vendors;
    const vendorId = (vendor?.id || r.invoices?.vendor_id || 'UNKNOWN_VENDOR') as string;
    const vendorName = (vendor?.name || 'UNKNOWN_VENDOR') as string;
    const inactiveVendor = vendor ? !vendor.is_active : false;

    const bucket =
      byVendor.get(vendorId) ||
      {
        vendorId,
        vendorName,
        inactiveVendor,
        count: 0,
        withCode: 0,
        topDescs: new Map(),
        codedExamples: [],
      };

    bucket.count += 1;
    const code = r.vendor_item_code?.trim() || '';
    if (code) {
      bucket.withCode += 1;
      if (bucket.codedExamples.length < 20) {
        bucket.codedExamples.push({
          invoiceNumber: r.invoices?.invoice_number || null,
          code,
          description: r.description || '',
        });
      }
    }

    const rawDesc = (r.description || '').trim();
    if (rawDesc) {
      const key = normDesc(rawDesc);
      const prev = bucket.topDescs.get(key);
      if (prev) prev.count += 1;
      else bucket.topDescs.set(key, { rawExample: rawDesc, count: 1 });
    }

    byVendor.set(vendorId, bucket);
  }

  const vendorsSorted = Array.from(byVendor.values()).sort((a, b) => b.count - a.count);

  const report: any = {
    totals: { totalLines, totalUnmatched },
    vendors: vendorsSorted.map((v) => {
      const top = Array.from(v.topDescs.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 25);

      return {
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        inactiveVendor: v.inactiveVendor,
        unmatchedCount: v.count,
        withVendorItemCodeCount: v.withCode,
        withVendorItemCodePct: v.count > 0 ? Math.round((v.withCode / v.count) * 1000) / 10 : 0,
        topUnmatchedDescriptions: top,
        sampleUnmatchedWithCode: v.codedExamples,
      };
    }),
  };

  const outPath = 'dev-output.unmatched-invoice-lines.json';
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`✅ Wrote report to ${outPath}`);
  console.log('\nTop vendors by unmatched lines:');
  for (const v of vendorsSorted.slice(0, 10)) {
    const pct = v.count > 0 ? Math.round((v.withCode / v.count) * 1000) / 10 : 0;
    const inactive = v.inactiveVendor ? ' (INACTIVE)' : '';
    console.log(`- ${v.vendorName}${inactive}: ${v.count} unmatched (${pct}% have vendor_item_code)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

