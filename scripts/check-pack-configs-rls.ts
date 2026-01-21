import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPackConfigs() {
  console.log('\n=== Checking Pack Configs ===\n');

  // Check total count with service role (bypasses RLS)
  const { count, error: countError } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true });

  console.log('Total pack configs in DB:', count);

  // Sample a few pack configs
  const { data: sample, error } = await supabase
    .from('item_pack_configurations')
    .select('*, items(name, organization_id)')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\nSample pack configs:');
  sample?.forEach(pc => {
    console.log(`- ${(pc.items as any)?.name}: ${pc.pack_quantity} × ${pc.pack_size}${pc.pack_unit} (org: ${(pc.items as any)?.organization_id})`);
  });

  // Check RLS policies
  const { data: policies } = await supabase
    .rpc('pg_policies')
    .select('*')
    .eq('tablename', 'item_pack_configurations');

  console.log('\nRLS Policies:', policies);
}

checkPackConfigs();
