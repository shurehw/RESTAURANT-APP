import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Check purchase items
  const { data, error } = await supabase.from('tipsee_purchase_items').select('*').limit(1);
  console.log('purchase_items error:', error?.message || 'none');
  if (data && data[0]) {
    console.log('columns:', Object.keys(data[0]).join(', '));
    console.log('sample:', JSON.stringify(data[0], null, 2));
  }

  // Also check category distribution of unmatched packs
  const { data: unmatched } = await supabase
    .from('item_pack_configurations')
    .select('item:items(category)')
    .not('vendor_item_code', 'is', null)
    .is('vendor_id', null)
    .limit(3000);

  const cats = new Map<string, number>();
  unmatched?.forEach((p: any) => {
    const cat = p.item?.category || 'unknown';
    cats.set(cat, (cats.get(cat) || 0) + 1);
  });

  console.log('\nUnmatched packs by category:');
  Array.from(cats.entries()).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });
}

main();
