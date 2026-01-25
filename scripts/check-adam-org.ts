import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdamOrg() {
  console.log('🔍 Checking Adam\'s organization membership\n');

  // First, find all users in the users table
  const { data: users } = await supabase
    .from('users')
    .select('id, email, full_name, is_active')
    .ilike('email', '%adam%')
    .or('email.ilike.%vieli%');

  if (!users || users.length === 0) {
    console.log('❌ No users found matching "adam" or "vieli"\n');

    // Show all users
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, email, full_name')
      .limit(10);

    console.log('First 10 users in system:');
    allUsers?.forEach(u => console.log(`  ${u.email} - ${u.full_name} (${u.id})`));
    return;
  }

  console.log(`Found ${users.length} user(s):\n`);

  for (const user of users) {
    console.log(`📧 ${user.email} - ${user.full_name}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Active: ${user.is_active}`);

    // Check org membership
    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select(`
        organization_id,
        role,
        is_active,
        organizations(name)
      `)
      .eq('user_id', user.id);

    if (!orgUsers || orgUsers.length === 0) {
      console.log(`   ⚠️  NOT IN ANY ORGANIZATION!\n`);
    } else {
      console.log(`   Organizations:`);
      orgUsers.forEach(ou => {
        console.log(`     - ${(ou.organizations as any)?.name} (${ou.role}, ${ou.is_active ? 'Active' : 'Inactive'})`);
      });
      console.log('');
    }
  }

  console.log('✨ Done');
}

checkAdamOrg().catch(console.error);
