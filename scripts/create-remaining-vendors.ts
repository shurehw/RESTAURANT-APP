import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VENDORS = [
  'MARKOL',
  'Dublin Daria LLC',
  'Duhalla Distributing LLC',
  'The Chefswarehouse'
];

function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.']/g, '')
    .replace(/\b(llc|inc|corp|ltd|company|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function createVendors() {
  console.log('🍽️  Creating Remaining Vendors');
  console.log('═'.repeat(70));

  const normalized = VENDORS.map(v => normalizeVendorName(v));
  const { data: existing } = await supabase
    .from('vendors')
    .select('normalized_name')
    .in('normalized_name', normalized);

  const existingSet = new Set(existing?.map(v => v.normalized_name) || []);

  let created = 0;
  let skipped = 0;

  for (const vendorName of VENDORS) {
    const normalized = normalizeVendorName(vendorName);

    if (existingSet.has(normalized)) {
      console.log(`⏭️  ${vendorName} (already exists)`);
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('vendors')
      .insert({
        name: vendorName,
        normalized_name: normalized,
        is_active: true,
        payment_terms_days: 30
      });

    if (error) {
      console.log(`❌ ${vendorName}: ${error.message}`);
    } else {
      console.log(`✅ ${vendorName} → "${normalized}"`);
      created++;
      existingSet.add(normalized);
    }
  }

  console.log('\n📊 SUMMARY');
  console.log('═'.repeat(70));
  console.log(`✅ Created: ${created}`);
  console.log(`⏭️  Skipped (existing): ${skipped}`);
}

createVendors();
