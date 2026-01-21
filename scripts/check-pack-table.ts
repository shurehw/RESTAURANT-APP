import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTable() {
  console.log('\nChecking item_pack_configs table...\n');

  // Try to query the table
  const { data, error } = await supabase
    .from('item_pack_configs')
    .select('*')
    .limit(5);

  if (error) {
    console.error('Error querying table:', error);
    return;
  }

  console.log('Found', data?.length || 0, 'pack configs');

  if (data && data.length > 0) {
    console.log('\nSample config:');
    console.log(data[0]);
  }

  // Try to insert a test record
  const { data: items } = await supabase
    .from('items')
    .select('id, name')
    .limit(1);

  if (!items || items.length === 0) {
    console.log('No items found to test with');
    return;
  }

  console.log(`\nAttempting test insert for item: ${items[0].name}...`);

  const testConfig = {
    item_id: items[0].id,
    pack_type: 'test',
    units_per_pack: 1,
    unit_size: 750,
    unit_size_uom: 'ml',
    vendor_sku: 'TEST123'
  };

  const { data: insertData, error: insertError } = await supabase
    .from('item_pack_configs')
    .insert([testConfig])
    .select();

  if (insertError) {
    console.error('❌ Insert failed:', insertError);
    console.error('Details:', insertError.message);
    console.error('Code:', insertError.code);
  } else {
    console.log('✅ Insert succeeded:', insertData);

    // Clean up test record
    await supabase
      .from('item_pack_configs')
      .delete()
      .eq('pack_type', 'test');
  }
}

checkTable();
