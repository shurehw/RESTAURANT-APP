#!/usr/bin/env node
/**
 * Find similar vendor names that might be duplicates
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

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

function similarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

async function findSimilarVendors() {
  console.log('\n=== Finding Similar Vendor Names ===\n');

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Error fetching vendors:', error);
    return;
  }

  console.log(`Checking ${vendors?.length || 0} active vendors...\n`);

  const similar: Array<{vendor1: any, vendor2: any, similarity: number}> = [];

  // Compare each vendor with every other vendor
  for (let i = 0; i < (vendors?.length || 0); i++) {
    for (let j = i + 1; j < (vendors?.length || 0); j++) {
      const v1 = vendors![i];
      const v2 = vendors![j];

      const sim = similarity(v1.normalized_name, v2.normalized_name);

      // If similarity is > 70%, likely a duplicate
      if (sim > 0.7) {
        similar.push({ vendor1: v1, vendor2: v2, similarity: sim });
      }
    }
  }

  // Sort by similarity descending
  similar.sort((a, b) => b.similarity - a.similarity);

  console.log(`\n=== Similar Vendors (>70% match) ===\n`);

  if (similar.length === 0) {
    console.log('No similar vendors found!');
    return;
  }

  similar.forEach(({ vendor1, vendor2, similarity }) => {
    console.log(`${(similarity * 100).toFixed(1)}% match:`);
    console.log(`  1. "${vendor1.name}"`);
    console.log(`     ID: ${vendor1.id}`);
    console.log(`  2. "${vendor2.name}"`);
    console.log(`     ID: ${vendor2.id}`);
    console.log('');
  });

  console.log(`\n=== Summary ===`);
  console.log(`Found ${similar.length} pairs of similar vendors`);
}

findSimilarVendors().catch(console.error);
