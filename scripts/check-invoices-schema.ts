import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Checking invoices table schema...\n');

  // Try to query the invoices table to see what columns exist
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error querying invoices:', error.message);
  } else {
    console.log('Invoices table columns:');
    if (data && data.length > 0) {
      console.log(Object.keys(data[0]).join(', '));
    } else {
      console.log('No invoices found in table.');
    }
  }
}

main();
