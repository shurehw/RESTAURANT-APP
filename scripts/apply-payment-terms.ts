import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Attempting to add payment_terms column...\n');

  // First check if it already exists
  const { data: checkData, error: checkError } = await supabase
    .from('invoices')
    .select('payment_terms')
    .limit(1);

  if (!checkError) {
    console.log('✓ payment_terms column already exists!');
    return;
  }

  console.log('Column does not exist. You need to run this SQL in Supabase SQL Editor:\n');
  console.log('ALTER TABLE invoices ADD COLUMN payment_terms TEXT;\n');
  console.log('URL: https://mnraeesscqsaappkaldb.supabase.co/project/mnraeesscqsaappkaldb/sql/new');
  console.log('\nPress Enter after running the SQL to verify...');
}

main();
