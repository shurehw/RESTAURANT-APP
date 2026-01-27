/**
 * Analyze how many unmatched invoice line vendor_item_codes exist in:
 * - items.sku
 * - item_pack_configurations.vendor_item_code
 *
 * This helps determine whether we can auto-backfill matches from existing catalogs.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🔬 Analyzing unmatched vendor_item_code overlap\n');

  // Fetch distinct vendor_item_codes from unmatched lines
  const pageSize = 1000;
  let from = 0;
  const codes = new Set<string>();

  while (true) {
    const { data, error } = await supabase
      .from('invoice_lines')
      .select('vendor_item_code')
      .is('item_id', null)
      .not('vendor_item_code', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const r of data as any[]) {
      const c = (r.vendor_item_code || '').toString().trim();
      if (c) codes.add(c);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  const codeList = Array.from(codes);
  console.log(`Distinct unmatched vendor_item_codes: ${codeList.length}`);

  const chunkSize = 500;
  let inItemsSku = 0;
  let inPackConfigs = 0;

  for (let i = 0; i < codeList.length; i += chunkSize) {
    const chunk = codeList.slice(i, i + chunkSize);

    const { data: skuRows, error: skuErr } = await supabase
      .from('items')
      .select('sku')
      .in('sku', chunk)
      .eq('is_active', true);
    if (skuErr) throw skuErr;
    inItemsSku += (skuRows || []).length;

    const { data: packRows, error: packErr } = await supabase
      .from('item_pack_configurations')
      .select('vendor_item_code')
      .in('vendor_item_code', chunk);
    if (packErr) throw packErr;

    // packRows may contain duplicates across pack sizes; count distinct codes in this chunk
    const packSet = new Set((packRows || []).map((r) => r.vendor_item_code));
    inPackConfigs += packSet.size;
  }

  console.log(`Codes found in items.sku: ${inItemsSku}`);
  console.log(`Codes found in item_pack_configurations.vendor_item_code: ${inPackConfigs}`);

  const pct = (n: number) => (codeList.length > 0 ? Math.round((n / codeList.length) * 1000) / 10 : 0);
  console.log(`% in items.sku: ${pct(inItemsSku)}%`);
  console.log(`% in pack configs: ${pct(inPackConfigs)}%`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

