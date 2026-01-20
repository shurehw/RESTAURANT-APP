import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  console.log('Adding payment_terms column to invoices table...');

  // Use direct SQL query instead of rpc
  const { data, error } = await supabase
    .from('invoices')
    .select('payment_terms')
    .limit(1);

  // If the query fails with column doesn't exist, we need to add it
  // We'll use a raw SQL approach via the postgres connection
  const { error: alterError } = await supabase.rpc('exec', {
    sql: 'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT;'
  }) as any;

  if (alterError) {
    console.log('Note: exec RPC function may not exist, trying alternative approach...');
    console.log('Please run this SQL manually in Supabase SQL Editor:');
    console.log('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT;');
    process.exit(1);
  }

  console.log('✓ Successfully added payment_terms column to invoices table');
}

main();
