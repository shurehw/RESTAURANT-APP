import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('name', 'Verve Coffee 1(LB)')
    .eq('is_active', true);

  console.log('Verve Coffee:', items?.length || 0, 'items found');

  if (items?.[0]) {
    console.log('Item ID:', items[0].id);
    console.log('SKU:', items[0].sku);

    const { data: configs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .eq('item_id', items[0].id);

    console.log('Pack configs:', configs?.length || 0);

    if (configs && configs.length > 0) {
      configs.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.units_per_pack} × ${c.unit_size}${c.unit_size_uom}`);
      });
    }
  }
}

check();
