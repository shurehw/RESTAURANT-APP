import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function checkFunctions() {
  console.log('🔍 Checking all versions of GL suggestion functions...\n');

  // Try calling with different approaches
  console.log('Test 1: Direct RPC call');
  const { data: test1, error: error1 } = await supabase
    .rpc('suggest_gl_account_for_item_v2', {
      p_item_id: '00000000-0000-0000-0000-000000000001',
      p_organization_id: '00000000-0000-0000-0000-000000000001',
      p_vendor_id: null,
    });

  if (error1) {
    console.log('❌ Error:', error1.message);
    console.log('   Code:', error1.code);
    console.log('   Details:', error1.details);
    console.log('   Hint:', error1.hint);
  } else {
    console.log('✅ Success! Got', test1?.length || 0, 'results');
  }

  console.log('\nTest 2: Check if there are multiple function definitions');
  console.log('Go to Supabase SQL Editor and run:');
  console.log('');
  console.log("SELECT routine_name, routine_type, data_type");
  console.log("FROM information_schema.routines");
  console.log("WHERE routine_name LIKE '%suggest_gl%';");
  console.log('');
  console.log('This will show all GL suggestion functions in your database.');
}

checkFunctions();
