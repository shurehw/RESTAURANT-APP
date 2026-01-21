import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  const { data: items } = await supabase
    .from('items')
    .select('id, sku, category, subcategory, r365_reporting_uom, r365_cost_account')
    .eq('is_active', true);

  const { data: packs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const realSKUs = items?.filter(i => i.sku && !i.sku.startsWith('AUTO-')).length || 0;
  const withR365 = items?.filter(i => i.r365_reporting_uom || i.r365_cost_account).length || 0;
  const withSubcat = items?.filter(i => i.subcategory).length || 0;
  const itemsWithPacks = new Set(packs?.map(p => p.item_id)).size;

  console.log('\n=== FINAL VERIFICATION ===\n');
  console.log('Total items:', items?.length || 0);
  console.log('Items with real SKUs (not AUTO-):', realSKUs);
  console.log('Items with R365 fields:', withR365);
  console.log('Items with subcategory:', withSubcat);
  console.log('Total pack configurations:', packs?.length || 0);
  console.log('Items that have pack configs:', itemsWithPacks);
  console.log('');

  console.log('Categories:');
  const cats: Record<string, number> = {};
  items?.forEach(i => {
    cats[i.category] = (cats[i.category] || 0) + 1;
  });
  Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('  ' + k + ':', v));

  console.log('\n');
}

verify();
