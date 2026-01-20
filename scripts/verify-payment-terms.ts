import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Verifying payment_terms column exists...\n');

  const { data, error } = await supabase
    .from('invoices')
    .select('id, payment_terms')
    .limit(1);

  if (error) {
    console.error('❌ Error:', error.message);
    console.log('\nColumn does not exist or there is a permissions issue.');
  } else {
    console.log('✓ payment_terms column exists and is accessible!');
    if (data && data.length > 0) {
      console.log('Sample data:', data[0]);
    }
  }
}

main();
