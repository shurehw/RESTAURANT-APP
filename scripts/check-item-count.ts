/**
 * Trace where the 933 unmatched items came from
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all packs still missing vendor_id with item details
  let packs: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('item_pack_configurations')
      .select('id, vendor_item_code, created_at, updated_at, item:items(sku, name, category, created_at, organization_id)')
      .not('vendor_item_code', 'is', null)
      .is('vendor_id', null)
      .range(from, from + 1000 - 1);
    if (!data || data.length === 0) break;
    packs = packs.concat(data.filter((p: any) => p.item?.organization_id === org!.id));
    from += 1000;
    if (data.length < 1000) break;
  }

  console.log(`Unmatched packs: ${packs.length}\n`);

  // Group by item created_at date
  const byDate = new Map<string, number>();
  packs.forEach(p => {
    const d = (p.item as any)?.created_at?.substring(0, 10) || 'unknown';
    byDate.set(d, (byDate.get(d) || 0) + 1);
  });

  console.log('By item creation date:');
  Array.from(byDate.entries()).sort().forEach(([d, n]) => console.log(`  ${d}: ${n}`));

  // Group by pack created_at date
  const byPackDate = new Map<string, number>();
  packs.forEach(p => {
    const d = p.created_at?.substring(0, 10) || 'unknown';
    byPackDate.set(d, (byPackDate.get(d) || 0) + 1);
  });

  console.log('\nBy pack config creation date:');
  Array.from(byPackDate.entries()).sort().forEach(([d, n]) => console.log(`  ${d}: ${n}`));

  // Check how many have code = item SKU (from copy-sku script)
  let codeIsSku = 0;
  packs.forEach(p => {
    const code = p.vendor_item_code?.trim();
    const sku = (p.item as any)?.sku;
    if (code === sku) codeIsSku++;
  });
  console.log(`\nCode = item SKU (from copy-sku import): ${codeIsSku}`);

  // Group by vendor_item_code pattern
  const byCodePattern = new Map<string, { count: number; samples: string[] }>();
  packs.forEach(p => {
    const code = p.vendor_item_code?.trim() || '';
    const sku = (p.item as any)?.sku || '';
    let pattern = 'other';
    if (!code) pattern = 'empty';
    else if (code === sku) pattern = 'code = SKU (copy-sku import)';
    else if (/^\d+$/.test(code)) pattern = 'numeric-only (vendor catalog #)';
    else if (/^\d+-\d+$/.test(code)) pattern = 'numeric-dash (vendor catalog #)';
    else if (/^[A-Z]{2,4}\d/.test(code)) pattern = 'prefix+num (internal SKU format)';
    byCodePattern.set(pattern, {
      count: (byCodePattern.get(pattern)?.count || 0) + 1,
      samples: [...(byCodePattern.get(pattern)?.samples || []).slice(0, 3), `${code} → ${(p.item as any)?.name}`].slice(0, 3)
    });
  });

  console.log('\nBy vendor_item_code pattern:');
  Array.from(byCodePattern.entries()).sort((a, b) => b[1].count - a[1].count).forEach(([p, info]) => {
    console.log(`  ${p}: ${info.count}`);
    info.samples.forEach(s => console.log(`    ex: ${s}`));
  });

  // Category x creation date
  console.log('\nCategory x creation date:');
  const catDate = new Map<string, Map<string, number>>();
  packs.forEach(p => {
    const cat = (p.item as any)?.category || 'unknown';
    const d = (p.item as any)?.created_at?.substring(0, 10) || 'unknown';
    if (!catDate.has(d)) catDate.set(d, new Map());
    const m = catDate.get(d)!;
    m.set(cat, (m.get(cat) || 0) + 1);
  });

  Array.from(catDate.entries()).sort().forEach(([d, cats]) => {
    const parts = Array.from(cats.entries()).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`);
    console.log(`  ${d}: ${parts.join(', ')}`);
  });

  // Show update timestamps to trace which scripts touched them
  console.log('\nBy pack updated_at date:');
  const byUpdate = new Map<string, number>();
  packs.forEach(p => {
    const d = p.updated_at?.substring(0, 10) || 'unknown';
    byUpdate.set(d, (byUpdate.get(d) || 0) + 1);
  });
  Array.from(byUpdate.entries()).sort().forEach(([d, n]) => console.log(`  ${d}: ${n}`));
}

main().catch(console.error);
