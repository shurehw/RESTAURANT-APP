import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Checking if payment_terms column exists...');

  // Try to select payment_terms from invoices
  const { data, error } = await supabase
    .from('invoices')
    .select('payment_terms')
    .limit(1);

  if (error) {
    if (error.code === '42703' || error.message.includes('payment_terms')) {
      console.log('\n❌ Column does not exist. Please run this SQL in Supabase SQL Editor:\n');
      console.log('ALTER TABLE invoices ADD COLUMN payment_terms TEXT;\n');
      console.log('📍 SQL Editor URL: https://mnraeesscqsaappkaldb.supabase.co/project/mnraeesscqsaappkaldb/sql/new\n');
      process.exit(1);
    } else {
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  }

  console.log('✓ payment_terms column already exists!');
}

main();
