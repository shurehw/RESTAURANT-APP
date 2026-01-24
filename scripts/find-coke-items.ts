import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findCoke() {
  // Search for Coke/Coca-Cola items
  const { data: items, error } = await supabase
    .from('items')
    .select('*')
    .or('name.ilike.%coke%,name.ilike.%coca cola%')
    .eq('is_active', true)
    .limit(20);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!items || items.length === 0) {
    console.log('❌ No Coca-Cola items found in database');
    return;
  }

  console.log(`\n✅ Found ${items.length} Coca-Cola items:\n`);
  items.forEach((item, i) => {
    console.log(`${i + 1}. ${item.name}`);
    console.log(`   ID: ${item.id}`);
    console.log(`   Category: ${item.category} ${item.subcategory ? '> ' + item.subcategory : ''}`);
    console.log(`   Unit: ${item.unit || 'N/A'}`);
    console.log(`   Pack: ${item.pack_size || 'N/A'} ${item.pack_unit || ''}`);
    console.log('');
  });

  console.log('\n📋 Looking for match to:');
  console.log('   "CASE COKE * USA CAN E GAR 8 OZ 6 PACK GLASS"');
  console.log('   → Coca-Cola, 8oz glass bottles, 6-pack case');
}

findCoke();
