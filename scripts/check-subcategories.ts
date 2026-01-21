import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSubcategories() {
  const { data } = await supabase
    .from('items')
    .select('name, category, subcategory')
    .eq('is_active', true)
    .eq('category', 'liquor')
    .limit(30);

  console.log('\nSample liquor products:\n');
  data?.forEach(item => {
    console.log(`- ${item.name}`);
    console.log(`  category: '${item.category}'`);
    console.log(`  subcategory: '${item.subcategory}'`);
    console.log('');
  });
}

checkSubcategories();
