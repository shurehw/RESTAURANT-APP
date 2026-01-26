/**
 * Analyze Duplicate Vendors
 * Find vendors with similar names and analyze how they were created
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Normalize vendor name for comparison (more aggressive than DB normalized_name)
function aggressiveNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .replace(/\b(inc|llc|corp|co|ltd|foods|food|company|enterprises|enterprise|distribution|dist|supply|supplies)\b/g, '')
    .trim();
}

async function analyzeDuplicates() {
  console.log('🔍 Analyzing Vendor Duplicates\n');
  console.log('='.repeat(80));

  // Get all vendors
  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active, created_at')
    .order('name');

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`\n📊 Total vendors: ${vendors.length}\n`);

  // Group by aggressive normalized name
  const groups = new Map<string, typeof vendors>();
  
  for (const vendor of vendors) {
    const key = aggressiveNormalize(vendor.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(vendor);
  }

  // Find groups with more than one vendor (potential duplicates)
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, vendors]) => vendors.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\n🔴 POTENTIAL DUPLICATE GROUPS: ${duplicateGroups.length}\n`);
  console.log('='.repeat(80));

  for (const [normalized, vendorGroup] of duplicateGroups) {
    console.log(`\n📦 Group: "${normalized}" (${vendorGroup.length} vendors)`);
    console.log('-'.repeat(60));
    
    // Get invoice counts for each vendor
    for (const vendor of vendorGroup) {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', vendor.id);

      console.log(`  • "${vendor.name}"`);
      console.log(`    ID: ${vendor.id}`);
      console.log(`    Normalized: ${vendor.normalized_name}`);
      console.log(`    Active: ${vendor.is_active}`);
      console.log(`    Created: ${new Date(vendor.created_at).toLocaleDateString()}`);
      console.log(`    Invoices: ${count || 0}`);
    }
  }

  // Summary stats
  console.log('\n' + '='.repeat(80));
  console.log('\n📈 SUMMARY\n');
  
  const totalDuplicateVendors = duplicateGroups.reduce((sum, [_, v]) => sum + v.length - 1, 0);
  console.log(`  Total duplicate groups: ${duplicateGroups.length}`);
  console.log(`  Total vendors that could be merged: ${totalDuplicateVendors}`);
  console.log(`  Active vendors: ${vendors.filter(v => v.is_active).length}`);
  console.log(`  Inactive vendors: ${vendors.filter(v => !v.is_active).length}`);

  // Check for similar names using DB normalized_name
  console.log('\n' + '='.repeat(80));
  console.log('\n🔍 SAME NORMALIZED_NAME (Database duplicates)\n');
  
  const byNormalized = new Map<string, typeof vendors>();
  for (const vendor of vendors) {
    if (!byNormalized.has(vendor.normalized_name)) {
      byNormalized.set(vendor.normalized_name, []);
    }
    byNormalized.get(vendor.normalized_name)!.push(vendor);
  }

  const dbDuplicates = Array.from(byNormalized.entries())
    .filter(([_, vendors]) => vendors.length > 1);

  if (dbDuplicates.length === 0) {
    console.log('  ✅ No exact normalized_name duplicates found');
  } else {
    console.log(`  ⚠️  Found ${dbDuplicates.length} groups with same normalized_name:`);
    for (const [norm, vendorGroup] of dbDuplicates) {
      console.log(`\n  "${norm}":`);
      for (const v of vendorGroup) {
        console.log(`    - "${v.name}" (active: ${v.is_active})`);
      }
    }
  }

  // Return data for potential merge script
  return { duplicateGroups, vendors };
}

analyzeDuplicates()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
