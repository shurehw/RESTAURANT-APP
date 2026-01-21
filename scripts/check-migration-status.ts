import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkStatus() {
  // Check SKU migration
  const { data: withRealSKU } = await supabase
    .from('items')
    .select('id')
    .not('sku', 'like', 'AUTO-%');

  const { data: withAutoSKU } = await supabase
    .from('items')
    .select('id')
    .like('sku', 'AUTO-%');

  // Check pack configs
  const { data: packConfigs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const uniqueItems = new Set(packConfigs?.map(pc => pc.item_id)).size;

  console.log('\n=== Migration Status ===');
  console.log('Items with real SKUs:', withRealSKU?.length || 0);
  console.log('Items still with AUTO SKUs:', withAutoSKU?.length || 0);
  console.log('Total pack configs:', packConfigs?.length || 0);
  console.log('Items with pack configs:', uniqueItems);
  console.log('=======================\n');
}

checkStatus();
