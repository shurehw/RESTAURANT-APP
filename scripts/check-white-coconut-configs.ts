import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkConfigs() {
  const { data: items } = await supabase
    .from('items')
    .select('id, name')
    .eq('name', 'White Coconut Creme - Pyramid Teabags 1each')
    .eq('is_active', true);

  if (items && items[0]) {
    console.log('Item ID:', items[0].id);

    const { data: configs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .eq('item_id', items[0].id);

    console.log('\nPack configs:', configs?.length);
    configs?.forEach((c, i) => {
      console.log(`\nConfig ${i + 1}:`);
      console.log(`  ID: ${c.id}`);
      console.log(`  Pack Type: ${c.pack_type}`);
      console.log(`  Units: ${c.units_per_pack} × ${c.unit_size}${c.unit_size_uom}`);
      console.log(`  Vendor Code: ${c.vendor_item_code || 'none'}`);
      console.log(`  Created: ${c.created_at}`);
    });
  }
}

checkConfigs();
