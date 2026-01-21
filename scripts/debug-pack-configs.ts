import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugPackConfigs() {
  console.log('\n=== Debug Pack Configs ===\n');

  // Get total count
  const { count } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true });

  console.log('Total pack configs in database:', count);

  // Get sample with item details
  const { data: samples } = await supabase
    .from('item_pack_configurations')
    .select('id, item_id, pack_quantity, pack_size, pack_unit, items(name, sku)')
    .limit(10);

  console.log('\nSample pack configs:');
  samples?.forEach(pc => {
    const item = pc.items as any;
    console.log(`- ${item?.name} (${item?.sku}): ${pc.pack_quantity} × ${pc.pack_size}${pc.pack_unit}`);
  });

  // Check if RLS is enabled
  const { data: tableInfo } = await supabase
    .rpc('exec_sql', {
      query: `SELECT relrowsecurity FROM pg_class WHERE relname = 'item_pack_configurations'`
    })
    .single();

  console.log('\nRLS enabled:', tableInfo);

  // Check policies
  const { data: policies } = await supabase
    .from('pg_policies')
    .select('*')
    .eq('tablename', 'item_pack_configurations');

  console.log('\nPolicies found:', policies?.length || 0);
  policies?.forEach(p => {
    console.log(`- ${p.policyname}: ${p.cmd}`);
  });
}

debugPackConfigs().catch(console.error);
