import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMissingPacks() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true);

  const { data: packs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const packItemIds = new Set(packs?.map(p => p.item_id));
  const itemsWithoutPacks = items?.filter(i => !packItemIds.has(i.id)) || [];

  const withAutoSKU = itemsWithoutPacks.filter(i => i.sku?.startsWith('AUTO-')).length;
  const withRealSKU = itemsWithoutPacks.filter(i => i.sku && !i.sku.startsWith('AUTO-')).length;

  console.log('\n=== Items Without Pack Configs ===\n');
  console.log('Total items without pack configs:', itemsWithoutPacks.length);
  console.log('  - With AUTO-SKU (from invoices):', withAutoSKU);
  console.log('  - With real SKU (from Excel, should have packs):', withRealSKU);

  if (withRealSKU > 0) {
    console.log('\nSample items with real SKU but no packs:');
    itemsWithoutPacks
      .filter(i => i.sku && !i.sku.startsWith('AUTO-'))
      .slice(0, 10)
      .forEach(i => console.log('  ' + i.name + ' | SKU: ' + i.sku));
  }
}

checkMissingPacks();
