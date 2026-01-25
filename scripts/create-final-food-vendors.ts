import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VENDORS = [
  'Dalton Plumbing LLC',
  'chefswarehouse',
  'Keith Foods',
  'Delilah Data LLC',
  'Chefs Warehouse Midwest LLC',
  'Nabila Nuttall LLC',
  'RARE FOODS',
  'SYSCO North Texas',
  'SYSCO',
  'The Chefs\' Warehouse Midwest LLC',
  'OAK FARMS-DALLAS DFA DAIRY BRANDS',
  'Grabs Produce',
  'THE CHEF\'S WAREHOUSE MIDWEST LLC',
  'Chefswarehouse',
  'ROCKER BROS. MEAT & PROVISION, INC.',
  'SYSCO NORTH TEXAS',
  'FARM to TABLE',
  'OAK FARMS-DALLAS (DFA DAIRY BRANDS)',
  'ChefsWarehouse',
  'Sysco North Texas',
  'Farm to Table',
  'MARCONI',
  'MARION',
  'UNKNOWN',
  'Mt Greens',
  'MARBOOL',
  'Empire Baking Company'
];

function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,\.'()]/g, '')
    .replace(/\b(llc|inc|corp|ltd|company|co)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function createVendors() {
  console.log('🍽️  Creating Final Food Vendors');
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
      console.log(`⏭️  ${vendorName} (already exists as "${normalized}")`);
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
