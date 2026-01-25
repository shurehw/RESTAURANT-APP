#!/usr/bin/env node
/**
 * Find duplicate vendors
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

async function findDuplicates() {
  console.log('\n=== Finding Duplicate Vendors ===\n');

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active, created_at')
    .order('normalized_name')
    .order('created_at');

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  // Group by normalized_name
  const grouped = new Map<string, typeof vendors>();
  vendors?.forEach(v => {
    if (!grouped.has(v.normalized_name)) {
      grouped.set(v.normalized_name, []);
    }
    grouped.get(v.normalized_name)!.push(v);
  });

  // Find duplicates
  const duplicates = Array.from(grouped.entries()).filter(([_, vendors]) => vendors.length > 1);

  console.log(`Total vendors: ${vendors?.length || 0}`);
  console.log(`Unique normalized names: ${grouped.size}`);
  console.log(`Duplicates found: ${duplicates.length}\n`);

  duplicates.forEach(([normalizedName, dupeVendors]) => {
    console.log(`\n"${normalizedName}" (${dupeVendors.length} entries):`);
    dupeVendors.forEach((v, idx) => {
      console.log(`  ${idx + 1}. "${v.name}" (${v.is_active ? 'Active' : 'Inactive'}) - Created: ${new Date(v.created_at).toLocaleDateString()}`);
      console.log(`     ID: ${v.id}`);
    });
  });

  // Count total duplicate entries
  const totalDupes = duplicates.reduce((sum, [_, vendors]) => sum + vendors.length - 1, 0);
  console.log(`\n\n=== Summary ===`);
  console.log(`${totalDupes} duplicate vendor entries that could be merged`);
}

findDuplicates().catch(console.error);
