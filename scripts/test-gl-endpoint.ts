import { createClient } from '@supabase/supabase-js';

async function testGLAccounts() {
  console.log('🧪 Testing GL Accounts Endpoint\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get Hwood Group organization directly
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('name', 'Hwood Group')
    .single();

  if (!org) {
    console.error('❌ Hwood Group not found');
    return;
  }

  console.log('Organization:', org.name);
  const orgId = org.id;
  console.log(`\n📊 Fetching GL accounts for org: ${orgId}\n`);

  // Fetch GL accounts directly
  const { data: accounts, error } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name, section, display_order, is_active, is_summary')
    .eq('org_id', orgId)
    .order('section')
    .order('display_order');

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Total GL accounts: ${accounts?.length || 0}`);

  // Filter active, non-summary accounts
  const activeAccounts = accounts?.filter(a => a.is_active && !a.is_summary) || [];
  console.log(`Active, non-summary accounts: ${activeAccounts.length}\n`);

  // Show first 10
  console.log('Sample accounts:');
  activeAccounts.slice(0, 10).forEach((acc) => {
    console.log(`  ${acc.external_code || 'N/A'} - ${acc.name} (${acc.section})`);
  });

  // Check for issues
  if (activeAccounts.length === 0) {
    console.error('\n❌ No active GL accounts found! This is the problem.');
  } else {
    console.log('\n✅ GL accounts are available in database.');
  }

  console.log('\n✨ Done!');
}

testGLAccounts().catch(console.error);
