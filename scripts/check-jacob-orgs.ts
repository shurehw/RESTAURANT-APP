import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkJacobOrgs() {
  console.log('🔍 Checking jacob@hwoodgroup.com organizations...\n');

  // Get jacob
  const { data: users } = await supabase.auth.admin.listUsers();
  const jacob = users?.users.find(u => u.email === 'jacob@hwoodgroup.com');

  if (!jacob) {
    console.error('❌ jacob@hwoodgroup.com not found');
    return;
  }

  console.log(`User: ${jacob.email} (${jacob.id})\n`);

  // Check organization_users
  const { data: orgUsers, error: orgError } = await supabase
    .from('organization_users')
    .select('organization_id, role, is_active, organizations(name, slug)')
    .eq('user_id', jacob.id);

  if (orgError) {
    console.error('❌ Error fetching organization_users:', orgError);
  } else {
    console.log(`Organization memberships: ${orgUsers?.length || 0}\n`);
    orgUsers?.forEach((ou: any) => {
      console.log(`${ou.is_active ? '✅' : '❌'} ${ou.organizations?.name || 'Unknown'}`);
      console.log(`   - Org ID: ${ou.organization_id}`);
      console.log(`   - Role: ${ou.role}`);
      console.log(`   - Active: ${ou.is_active}`);
      console.log('');
    });
  }

  // Simulate the page query
  console.log('Testing page query logic:\n');

  const { data: testOrgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', jacob.id)
    .eq('is_active', true)
    .single();

  if (!testOrgUsers?.organization_id) {
    console.error('❌ Page query would fail: No active organization found');
    console.log('   This is why you see "No organization found for user"');
  } else {
    console.log(`✅ Page query would succeed with org: ${testOrgUsers.organization_id}`);
  }

  console.log('\n✅ Check complete!');
}

checkJacobOrgs();
