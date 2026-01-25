import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixDuplicates() {
  const supabase = createAdminClient();

  console.log('\n🔧 Fixing vendor duplicates...\n');

  // 1. Delete duplicate OAK FARMS
  const { data: oakDupes } = await supabase
    .from('vendors')
    .select('id, name, created_at')
    .eq('normalized_name', 'oak farms-dallas dfa dairy brands')
    .order('created_at', { ascending: false });

  if (oakDupes && oakDupes.length > 1) {
    const newerDupe = oakDupes[0];
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', newerDupe.id);

    if (error) {
      console.log(`❌ Failed to delete OAK FARMS duplicate: ${error.message}`);
    } else {
      console.log(`✅ Deleted duplicate OAK FARMS-DALLAS DFA DAIRY BRANDS (${newerDupe.id})`);
    }
  }

  // 2. Check if Keith Foods should be Ben E Keith
  console.log('\n❓ Is "Keith Foods" actually "Ben E Keith"?');
  console.log('   These are likely the same vendor - Ben E Keith is a major food distributor.');
  console.log('   Recommendation: Delete "Keith Foods" and map invoices to "Ben E Keith"');

  // 3. Add SYSCO North Texas as alias to SYSCO
  console.log('\n❓ Should "SYSCO North Texas" be an alias of "SYSCO"?');
  console.log('   Recommendation: Keep separate - regional divisions often have different pricing');
}

fixDuplicates()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
