import { createClient } from '@supabase/supabase-js';

async function checkItem() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('sku', '64051')
    .single();

  console.log('Item 64051:');
  console.log('Name:', item?.name);
  console.log('SKU:', item?.sku);
  console.log('Category (raw):', item?.category);
  console.log('Subcategory (raw):', item?.subcategory);
  console.log('Base UOM (raw):', item?.base_uom);
  console.log('\nAll fields:', item);
}

checkItem();
