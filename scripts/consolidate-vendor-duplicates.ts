import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function consolidateVendors() {
  const supabase = createAdminClient();

  console.log('\n🔧 Consolidating vendor duplicates...\n');

  // 1. MARCONI vs MARION - delete MARCONI, it's likely a typo
  const { data: marionVendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('normalized_name', 'marion')
    .single();

  const { data: marconiVendor } = await supabase
    .from('vendors')
    .select('id')
    .eq('normalized_name', 'marconi')
    .single();

  if (marconiVendor) {
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', marconiVendor.id);

    if (error) {
      console.log(`❌ Failed to delete MARCONI: ${error.message}`);
    } else {
      console.log(`✅ Deleted MARCONI (typo of MARION)`);
    }
  }

  // 2. Keith Foods vs Ben E Keith - delete Keith Foods
  const { data: keithFoods } = await supabase
    .from('vendors')
    .select('id')
    .eq('normalized_name', 'keith foods')
    .single();

  if (keithFoods) {
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', keithFoods.id);

    if (error) {
      console.log(`❌ Failed to delete Keith Foods: ${error.message}`);
    } else {
      console.log(`✅ Deleted "Keith Foods" (should be "Ben E Keith")`);
    }
  }

  console.log('\n📊 Summary: Cleaned up vendor duplicates');
}

consolidateVendors()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
