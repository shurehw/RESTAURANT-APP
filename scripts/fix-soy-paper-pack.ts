import { createClient } from '@supabase/supabase-js';

async function fixSoyPaperPack() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get the soy paper item
  const { data: item } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('sku', '64051')
    .single();

  console.log('Item:', item?.name);

  // Get pack configs
  const { data: packConfigs } = await supabase
    .from('item_pack_configurations')
    .select('*')
    .eq('item_id', item!.id);

  console.log('\nCurrent pack configs:');
  packConfigs?.forEach((pc, i) => {
    console.log(`  ${i + 1}. ${pc.pack_type} - ${pc.units_per_pack} x ${pc.unit_size} ${pc.unit_size_uom}`);
  });

  // Delete the bottle pack config
  const bottlePack = packConfigs?.find(pc => pc.pack_type === 'bottle');

  if (bottlePack) {
    console.log('\nDeleting bottle pack config...');
    const { error } = await supabase
      .from('item_pack_configurations')
      .delete()
      .eq('id', bottlePack.id);

    if (error) {
      console.error('Error:', error);
    } else {
      console.log('✓ Deleted bottle pack config');
    }
  }
}

fixSoyPaperPack();
