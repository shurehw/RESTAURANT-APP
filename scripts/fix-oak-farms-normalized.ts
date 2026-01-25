import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixOakFarmsNormalized() {
  const supabase = createAdminClient();

  console.log('\n🔧 Fixing Oak Farms normalized name...\n');

  // Update the normalized name to be consistent (without hyphen before "dallas")
  const { error } = await supabase
    .from('vendors')
    .update({ normalized_name: 'oak farms dallas dfa dairy brands' })
    .eq('normalized_name', 'oak farms-dallas dfa dairy brands');

  if (error) {
    console.error('❌ Failed to update:', error.message);
    return;
  }

  console.log('✅ Updated Oak Farms normalized name');
}

fixOakFarmsNormalized()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
