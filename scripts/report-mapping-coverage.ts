/**
 * Quick coverage report for mapping tables:
 * - vendor_item_aliases count
 * - vendor_items count (rows w/ vendor_item_code)
 * - item_pack_configurations rows w/ vendor_item_code
 * - items count
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function count(table: string, filter?: (q: any) => any): Promise<number> {
  const base = supabase.from(table).select('id', { count: 'exact', head: true });
  const q = filter ? filter(base) : base;
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function main() {
  console.log('📊 Mapping coverage report\n');

  const items = await count('items');
  const vendorItems = await count('vendor_items');
  const vendorItemsWithCode = await count('vendor_items', (q) => q.not('vendor_item_code', 'is', null));
  const vendorAliases = await count('vendor_item_aliases');
  const packConfigs = await count('item_pack_configurations');
  const packConfigsWithCode = await count('item_pack_configurations', (q) => q.not('vendor_item_code', 'is', null));

  console.log(`items: ${items}`);
  console.log(`vendor_items: ${vendorItems} (with vendor_item_code: ${vendorItemsWithCode})`);
  console.log(`vendor_item_aliases: ${vendorAliases}`);
  console.log(`item_pack_configurations: ${packConfigs} (with vendor_item_code: ${packConfigsWithCode})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  });

