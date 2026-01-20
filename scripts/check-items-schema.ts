import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Checking items table schema...\n');

  // Try to query the items table to see what columns exist
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying items:', error.message);
    console.log('\nThe items table might not exist. Checking if it exists...\n');

    // Try a different approach - just select count
    const { count, error: countError } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Items table does not exist or has issues:', countError.message);
    } else {
      console.log(`Items table exists with ${count} rows`);
    }
  } else {
    console.log('Items table exists!');
    if (data && data.length > 0) {
      console.log('\nSample item columns:', Object.keys(data[0]));
    } else {
      console.log('Items table is empty, cannot show columns.');
    }
  }
}

main();
