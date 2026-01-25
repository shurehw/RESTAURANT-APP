#!/usr/bin/env node
/**
 * Delete vendors with 0 invoices
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function deleteUnusedVendors() {
  console.log('\n=== Finding Unused Vendors ===\n');

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, created_at')
    .order('name');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const unused = [];

  for (const vendor of vendors || []) {
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendor.id);

    if (count === 0) {
      unused.push(vendor);
    }
  }

  console.log(`Found ${unused.length} vendors with 0 invoices:\n`);

  if (unused.length === 0) {
    console.log('No unused vendors to delete!');
    return;
  }

  for (const vendor of unused) {
    console.log(`  - "${vendor.name}" (created ${new Date(vendor.created_at).toLocaleDateString()})`);
  }

  console.log('\nDeleting unused vendors...\n');

  const { error: deleteError } = await supabase
    .from('vendors')
    .delete()
    .in('id', unused.map(v => v.id));

  if (deleteError) {
    console.error('❌ Error deleting vendors:', deleteError);
    return;
  }

  console.log(`✅ Deleted ${unused.length} unused vendors`);
}

deleteUnusedVendors().catch(console.error);
