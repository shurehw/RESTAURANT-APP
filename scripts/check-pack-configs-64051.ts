import { createClient } from '@supabase/supabase-js';

async function checkPackConfigs() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: item } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('sku', '64051')
    .single();

  console.log('Item:', item?.name, '(', item?.sku, ')');

  const { data: packConfigs } = await supabase
    .from('item_pack_configurations')
    .select('*')
    .eq('item_id', item!.id);

  console.log('\nPack Configurations:');
  if (packConfigs && packConfigs.length > 0) {
    packConfigs.forEach((pc, i) => {
      console.log(`\nPack #${i + 1}:`);
      console.log('  Pack Type:', pc.pack_type);
      console.log('  Qty/Pack:', pc.units_per_pack);
      console.log('  Unit Size:', pc.unit_size);
      console.log('  Unit Size UOM:', pc.unit_size_uom);
    });
  } else {
    console.log('  No pack configurations found');
  }
}

checkPackConfigs();
