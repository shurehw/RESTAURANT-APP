import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function testFunction() {
  console.log('Testing GL suggestion function directly...\n');

  // First, check if function exists by looking at pg_proc
  const { data: funcCheck, error: funcError } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT proname, pronargs
        FROM pg_proc
        WHERE proname = 'suggest_gl_account_for_item_v2'
      `
    })
    .catch(() => ({ data: null, error: null }));

  if (funcCheck) {
    console.log('Function metadata:', funcCheck);
  }

  // Test with a simple query
  const { data, error } = await supabase
    .rpc('suggest_gl_account_for_item_v2', {
      p_item_id: '00000000-0000-0000-0000-000000000001',
      p_organization_id: '00000000-0000-0000-0000-000000000001',
      p_vendor_id: null,
    });

  if (error) {
    console.error('❌ Error:', error);
    console.log('\nThis suggests the function definition in the database is still the old version.');
    console.log('Try running this in Supabase SQL Editor to check the current function:\n');
    console.log('\\df+ suggest_gl_account_for_item_v2\n');
  } else {
    console.log('✅ Function works!');
    console.log('Results:', data);
  }
}

testFunction();
