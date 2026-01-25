#!/usr/bin/env node
/**
 * Check vendors in database
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

async function checkVendors() {
  console.log('\n=== Checking Vendors ===\n');

  const correctOrgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, organization_id, is_active')
    .eq('organization_id', correctOrgId)
    .order('name');

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`Found ${vendors?.length || 0} vendors for The h.wood Group:\n`);
  vendors?.forEach((v, idx) => {
    console.log(`${idx + 1}. ${v.name} (${v.is_active ? 'Active' : 'Inactive'})`);
  });
}

checkVendors().catch(console.error);
