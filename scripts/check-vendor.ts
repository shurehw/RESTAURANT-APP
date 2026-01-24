import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name')
    .ilike('name', '%rare%tea%');

  console.log('Vendors matching "rare tea":', vendors);

  const { data: allVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .order('name')
    .limit(50);

  console.log('\nAll vendors (first 50):');
  allVendors?.forEach(v => console.log(`  - ${v.name}`));
})();
