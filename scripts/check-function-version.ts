import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFunction() {
  // Query the function definition
  const { data, error } = await supabase
    .from('pg_proc')
    .select('*')
    .eq('proname', 'create_invoice_with_lines')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Function exists:', data);
  }

  // Try to get the source
  const { data: source, error: sourceError } = await supabase.rpc(
    'get_function_definition' as any,
    { func_name: 'create_invoice_with_lines' }
  );

  if (sourceError) {
    console.log('\nCannot retrieve function source automatically.');
    console.log('Please apply the migration manually in Supabase SQL Editor.');
  } else {
    console.log('\nFunction source:', source);
  }
}

checkFunction();
