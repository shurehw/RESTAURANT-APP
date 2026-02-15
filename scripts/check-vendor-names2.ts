import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: org } = await sb.from('organizations').select('id').ilike('name', '%wood%').single();

  // Check seafood vendors
  const { data: seafood } = await sb.from('vendors').select('id, name').eq('organization_id', org!.id).ilike('name', '%seafood%');
  console.log('Seafood vendors:');
  for (const v of seafood || []) {
    const { count } = await sb.from('item_pack_configurations').select('id', { count: 'exact', head: true }).eq('vendor_id', v.id);
    console.log(`  "${v.name}" (${v.id}): ${count} packs`);
  }

  // All vendors with pack counts
  console.log('\nAll vendors with packs:');
  const { data: all } = await sb.from('vendors').select('id, name').eq('organization_id', org!.id).order('name');
  for (const v of all || []) {
    const { count } = await sb.from('item_pack_configurations').select('id', { count: 'exact', head: true }).eq('vendor_id', v.id);
    if (count && count > 0) console.log(`  "${v.name}": ${count}`);
  }
}

main().catch(console.error);
