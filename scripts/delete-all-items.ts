import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteAllItems() {
  console.log('⚠️  WARNING: This will delete ALL items from your database!\n');

  // Get count first
  const { count } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true });

  console.log(`Found ${count} items to delete.\n`);

  if (!count || count === 0) {
    console.log('No items to delete!');
    return;
  }

  console.log('Deleting all items...\n');

  // Delete all items (pack configs will cascade automatically)
  const { error } = await supabase
    .from('items')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

  if (error) {
    console.error('❌ Failed to delete items:', error.message);
  } else {
    console.log(`✅ Successfully deleted ${count} items!`);
    console.log('\nYou can now re-import the Excel file with the fixed import code.');
  }
}

deleteAllItems();
