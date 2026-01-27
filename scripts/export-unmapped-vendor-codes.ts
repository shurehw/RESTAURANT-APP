/**
 * Export unmapped invoice lines that HAVE vendor_item_code.
 *
 * Output CSV columns:
 * vendor_id, vendor_name, vendor_item_code, example_description, occurrences, last_unit_cost, last_invoice_number, last_invoice_date
 *
 * Purpose:
 * - Create a mapping sheet for vendor_item_aliases (vendor code -> item)
 * - After filling in item_sku, you can import with scripts/import-vendor-item-aliases-from-csv.ts
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

type Row = {
  vendor_item_code: string;
  description: string;
  unit_cost: number | null;
  invoice: {
    invoice_number: string | null;
    invoice_date: string | null;
    vendor: { id: string; name: string } | null;
  };
};

function tsvEscape(s: string): string {
  return (s || '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ').trim();
}

async function main() {
  console.log('📤 Exporting unmapped vendor codes...\n');

  const pageSize = 1000;
  let from = 0;
  const rows: Row[] = [];

  while (true) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select(
        `
        vendor_item_code,
        description,
        unit_cost,
        invoice:invoices!inner(
          invoice_number,
          invoice_date,
          vendor:vendors!inner(id, name)
        )
      `
      )
      .is('item_id', null)
      .not('vendor_item_code', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...(data as any));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (rows.length === 0) {
    console.log('✅ No unmapped lines with vendor_item_code found.');
    return;
  }

  // Aggregate by vendor_id + vendor_item_code (primary key for alias table)
  const agg = new Map<
    string,
    {
      vendor_id: string;
      vendor_name: string;
      vendor_item_code: string;
      example_description: string;
      occurrences: number;
      last_unit_cost: number | null;
      last_invoice_number: string | null;
      last_invoice_date: string | null;
    }
  >();

  for (const r of rows) {
    const vendor = r.invoice?.vendor;
    if (!vendor) continue;
    const code = (r.vendor_item_code || '').toString().trim();
    const desc = (r.description || '').toString().trim();
    if (!code || !desc) continue;

    const key = `${vendor.id}::${code}`;
    const prev = agg.get(key);
    const invDate = r.invoice?.invoice_date || null;

    if (!prev) {
      agg.set(key, {
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        vendor_item_code: code,
        example_description: desc,
        occurrences: 1,
        last_unit_cost: r.unit_cost ?? null,
        last_invoice_number: r.invoice?.invoice_number || null,
        last_invoice_date: invDate,
      });
    } else {
      prev.occurrences += 1;
      // Prefer the most recent invoice context if invoice_date is newer
      if (invDate && (!prev.last_invoice_date || invDate > prev.last_invoice_date)) {
        prev.last_unit_cost = r.unit_cost ?? prev.last_unit_cost;
        prev.last_invoice_number = r.invoice?.invoice_number || prev.last_invoice_number;
        prev.last_invoice_date = invDate;
        prev.example_description = desc || prev.example_description;
      }
    }
  }

  const out = Array.from(agg.values()).sort((a, b) => b.occurrences - a.occurrences);

  const headers = [
    'vendor_id',
    'vendor_name',
    'vendor_item_code',
    'example_description',
    'occurrences',
    'last_unit_cost',
    'last_invoice_number',
    'last_invoice_date',
    // user fills:
    'item_sku',
  ];

  const lines = [
    headers.join('\t'),
    ...out.map((r) =>
      [
        r.vendor_id,
        tsvEscape(r.vendor_name),
        tsvEscape(r.vendor_item_code),
        tsvEscape(r.example_description),
        r.occurrences.toString(),
        r.last_unit_cost != null ? r.last_unit_cost.toFixed(4) : '',
        r.last_invoice_number || '',
        r.last_invoice_date || '',
        '', // item_sku to be filled in
      ].join('\t')
    ),
  ].join('\n');

  const filename = `unmapped-vendor-codes-${new Date().toISOString().split('T')[0]}.tsv`;
  fs.writeFileSync(path.join(process.cwd(), filename), lines, 'utf8');

  console.log(`✅ Exported ${out.length} unique vendor codes`);
  console.log(`📄 File: ${filename}`);
  console.log('\nTop vendors by unmapped codes:');
  const byVendor = new Map<string, number>();
  for (const r of out) byVendor.set(r.vendor_name, (byVendor.get(r.vendor_name) || 0) + 1);
  for (const [name, cnt] of Array.from(byVendor.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`- ${name}: ${cnt} codes`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

