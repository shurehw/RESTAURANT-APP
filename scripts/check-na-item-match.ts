import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMatch() {
  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('id', '4032e6a5-57e4-49bf-8f97-c297083f50af')
    .single();

  if (!item) {
    console.log('❌ Item not found');
    return;
  }

  console.log('\n✅ Matched Item:');
  console.log(`  Name: ${item.name}`);
  console.log(`  Category: ${item.category}`);
  console.log(`  Subcategory: ${item.subcategory || 'N/A'}`);
  console.log(`  Unit: ${item.unit}`);
  console.log(`  Pack Size: ${item.pack_size || 'N/A'}`);
  console.log(`  Pack Unit: ${item.pack_unit || 'N/A'}`);
  console.log(`  Active: ${item.is_active}`);

  console.log('\n📋 Invoice Line Description:');
  console.log('  "CASE COKE * USA CAN E GAR 8 OZ 6 PACK GLASS"');

  console.log('\n❓ Does this match look correct?');
  console.log('   The invoice line appears to be Coca-Cola 8oz glass bottles, 6-pack, ordered by the case (2 cases)');
}

checkMatch();
