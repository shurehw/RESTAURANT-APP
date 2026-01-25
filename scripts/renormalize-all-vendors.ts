#!/usr/bin/env node
/**
 * Re-normalize all vendor names using updated normalization logic
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { normalizeVendorName } from '../lib/ocr/normalize';

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

async function renormalizeVendors() {
  console.log('\n=== Re-normalizing All Vendors ===\n');

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, organization_id')
    .order('name');

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`Found ${vendors?.length || 0} vendors\n`);

  let updated = 0;
  let unchanged = 0;

  for (const vendor of vendors || []) {
    const newNormalized = normalizeVendorName(vendor.name);

    if (newNormalized !== vendor.normalized_name) {
      console.log(`Updating "${vendor.name}"`);
      console.log(`  Old: "${vendor.normalized_name}"`);
      console.log(`  New: "${newNormalized}"`);

      const { error: updateError } = await supabase
        .from('vendors')
        .update({ normalized_name: newNormalized })
        .eq('id', vendor.id);

      if (updateError) {
        console.error(`  ❌ Error:`, updateError.message);
      } else {
        console.log(`  ✓ Updated`);
        updated++;
      }
      console.log('');
    } else {
      unchanged++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`\nRun find-similar-vendors.ts again to see remaining duplicates.`);
}

renormalizeVendors().catch(console.error);
