#!/usr/bin/env node
/**
 * Check vendors in database (simple)
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

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('*')
    .order('name')
    .limit(20);

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`Found ${vendors?.length || 0} vendors:\n`);
  vendors?.forEach((v, idx) => {
    console.log(`${idx + 1}. ${v.name} (${v.is_active ? 'Active' : 'Inactive'})`);
    console.log(`   Columns:`, Object.keys(v));
  });
}

checkVendors().catch(console.error);
