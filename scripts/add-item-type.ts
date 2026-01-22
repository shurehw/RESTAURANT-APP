import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addItemType() {
  console.log('\n=== Adding item_type Field ===\n');

  // Execute SQL to add column (if it doesn't exist)
  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'items' AND column_name = 'item_type'
        ) THEN
          ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'beverage';
          CREATE INDEX idx_items_item_type ON items(item_type);
          ALTER TABLE items ADD CONSTRAINT check_item_type CHECK (item_type IN ('beverage', 'food', 'other'));
        END IF;
      END
      $$;
    `
  });

  if (alterError) {
    console.error('Error adding column:', alterError);
    // Try direct approach
    console.log('Trying direct SQL execution...\n');

    const { error: addColError } = await (supabase as any).from('items').select('item_type').limit(1);

    if (addColError && addColError.message.includes('column')) {
      console.log('Column does not exist, need to add it manually via Supabase dashboard');
      console.log('\nRun this SQL in Supabase SQL Editor:');
      console.log('---');
      console.log('ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT \'beverage\';');
      console.log('CREATE INDEX idx_items_item_type ON items(item_type);');
      console.log('UPDATE items SET item_type = \'beverage\' WHERE item_type IS NULL;');
      console.log('---');
      return;
    }
  }

  // Tag all current items as 'beverage'
  const { data: items, error: updateError } = await supabase
    .from('items')
    .update({ item_type: 'beverage' })
    .is('item_type', null)
    .select('id');

  if (updateError) {
    console.error('Error updating items:', updateError);
  } else {
    console.log(`✅ Tagged ${items?.length || 0} items as 'beverage'`);
  }

  console.log('\n✨ All current items are now tagged as "beverage"');
  console.log('   When you import food items, they will be tagged as "food"\n');
}

addItemType().catch(console.error);
