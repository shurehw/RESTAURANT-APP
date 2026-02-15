import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkWineUOM() {
  const { data } = await supabase
    .from('items')
    .select('sku, name, category, base_uom, r365_measure_type')
    .eq('category', 'wine')
    .limit(10);

  console.log('Wine Items:\n');
  data?.forEach(item => {
    console.log(`${item.sku} - ${item.name}`);
    console.log(`  Base UOM: ${item.base_uom} | Measure Type: ${item.r365_measure_type}\n`);
  });
}

checkWineUOM();
