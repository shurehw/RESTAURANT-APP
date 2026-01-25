import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const missingVendors = [
  'SYSCO',
  'SYSCO North Texas',
  'FARM to TABLE',
  'RARE FOODS',
  'MARCONI',
  'MARION',
  'Mt Greens',
  'MARBOOL',
  'Dalton Plumbing LLC',
  'Keith Foods',
  'OAK FARMS-DALLAS DFA DAIRY BRANDS'
];

async function createMissingVendors() {
  const supabase = createAdminClient();

  console.log(`\n🏢 Creating ${missingVendors.length} missing vendors\n`);

  let created = 0;
  let skipped = 0;

  for (const vendorName of missingVendors) {
    const normalizedName = vendorName.toLowerCase().trim();

    // Check if vendor already exists
    const { data: existing } = await supabase
      .from('vendors')
      .select('id')
      .eq('normalized_name', normalizedName)
      .single();

    if (existing) {
      console.log(`⏭️  ${vendorName} - already exists`);
      skipped++;
      continue;
    }

    // Create vendor with organization_id
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .ilike('name', '%h.wood%')
      .single();

    const { data, error } = await supabase
      .from('vendors')
      .insert({
        organization_id: org?.id,
        name: vendorName,
        normalized_name: normalizedName,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.log(`❌ ${vendorName} - Error: ${error.message}`);
    } else {
      console.log(`✅ ${vendorName} - Created`);
      created++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already exist): ${skipped}`);
  console.log(`  Total: ${missingVendors.length}`);
}

createMissingVendors()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
