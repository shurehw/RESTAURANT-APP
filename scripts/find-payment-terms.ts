import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Checking for payment_terms column in all schemas...\n');

  // Query the information schema to find where payment_terms exists
  const { data, error } = await supabase.rpc('exec_query', {
    query: `
      SELECT
        table_schema,
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE column_name = 'payment_terms'
        AND table_name = 'invoices';
    `
  });

  if (error) {
    console.log('RPC not available, trying direct query...\n');

    // Try a simpler approach - just insert a test value
    const { error: insertError } = await supabase
      .from('invoices')
      .insert({
        vendor_id: '00000000-0000-0000-0000-000000000000',
        venue_id: '00000000-0000-0000-0000-000000000000',
        invoice_date: '2025-01-01',
        payment_terms: 'Net 30'
      });

    if (insertError) {
      console.error('Insert test failed:', insertError.message);
      console.log('\nThe column definitely does not exist in the public.invoices table.');
      console.log('\nTry this SQL exactly:\n');
      console.log('ALTER TABLE public.invoices ADD COLUMN payment_terms TEXT;');
    } else {
      console.log('✓ Column exists! (test insert succeeded)');
    }
  } else {
    console.log('Results:', data);
  }
}

main();
