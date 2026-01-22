import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addItemType() {
  console.log('\n=== Adding item_type Field ===\n');

  try {
    // First, check if column exists by trying to select it
    const { data: testData, error: testError } = await supabase
      .from('items')
      .select('item_type')
      .limit(1);

    if (testError && testError.message.includes('column')) {
      console.log('❌ Column does not exist. Please run this SQL in Supabase SQL Editor:\n');
      console.log('ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT \'beverage\';');
      console.log('CREATE INDEX idx_items_item_type ON items(item_type);');
      console.log('ALTER TABLE items ADD CONSTRAINT check_item_type CHECK (item_type IN (\'beverage\', \'food\', \'other\'));');
      console.log('UPDATE items SET item_type = \'beverage\' WHERE item_type IS NULL;\n');
      return;
    }

    console.log('✓ Column exists, tagging items...\n');

    // Tag all items without item_type as 'beverage'
    const { data: items, error: updateError } = await supabase
      .from('items')
      .update({ item_type: 'beverage' })
      .is('item_type', null)
      .select('id');

    if (updateError) {
      console.error('Error updating items:', updateError);
      return;
    }

    console.log(`✅ Tagged ${items?.length || 0} items as 'beverage'`);

    // Get total count
    const { count, error: countError } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('item_type', 'beverage');

    if (!countError) {
      console.log(`✅ Total beverage items: ${count}`);
    }

    console.log('\n✨ All current items are now tagged as "beverage"');
    console.log('   When you import food items, they will be tagged as "food"\n');
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

addItemType().catch(console.error);
