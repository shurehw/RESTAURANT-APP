import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function listAllVendors() {
  const supabase = createAdminClient();

  const { data: vendors, error } = await supabase
    .from('vendors')
    .select('id, name, normalized_name, created_at')
    .order('name');

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('\n📋 All Vendors:\n');
  vendors?.forEach((v, i) => {
    console.log(`${i + 1}. "${v.name}"`);
    console.log(`   ID: ${v.id}`);
    console.log(`   Normalized: "${v.normalized_name}"`);
    console.log(`   Created: ${v.created_at}\n`);
  });
}

listAllVendors()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
