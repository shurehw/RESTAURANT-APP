#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

(async () => {
  const { data } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, created_at')
    .ilike('name', '%spec%')
    .order('name');

  console.log('\n=== All Spec\'s Vendors ===\n');

  for (const v of data || []) {
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', v.id);

    console.log(`"${v.name}"`);
    console.log(`   Normalized: "${v.normalized_name}"`);
    console.log(`   Invoices: ${count || 0}`);
    console.log(`   Created: ${new Date(v.created_at).toLocaleDateString()}`);
    console.log(`   ID: ${v.id}\n`);
  }
})();
