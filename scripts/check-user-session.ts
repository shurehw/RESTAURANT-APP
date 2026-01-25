/**
 * Check if Adam has an active session in the database
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdamSession() {
  console.log('🔍 Checking Adam\'s session status\n');

  // Find Adam's user record
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();

  if (userError) {
    console.error('❌ Error fetching users:', userError);
    return;
  }

  const adam = users.users.find(u =>
    u.email?.toLowerCase().includes('adam') ||
    u.email?.toLowerCase().includes('vieli')
  );

  if (!adam) {
    console.log('❌ Adam not found in auth.users');
    console.log('\nAll users:');
    users.users.forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`));
    return;
  }

  console.log(`✅ Found user: ${adam.email}`);
  console.log(`   User ID: ${adam.id}`);
  console.log(`   Created: ${adam.created_at}`);
  console.log(`   Last sign in: ${adam.last_sign_in_at || 'Never'}`);
  console.log(`   Confirmed: ${adam.email_confirmed_at ? 'Yes' : 'No'}`);

  // Check organization membership
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id, role, is_active, organizations(name)')
    .eq('user_id', adam.id);

  console.log(`\n📊 Organization membership:`);
  if (!orgUsers || orgUsers.length === 0) {
    console.log('   ❌ Not associated with any organization!');
  } else {
    orgUsers.forEach(ou => {
      console.log(`   - ${(ou.organizations as any).name} (${ou.role}, ${ou.is_active ? 'Active' : 'Inactive'})`);
    });
  }

  // Check for active sessions (if stored in DB)
  const { data: sessions } = await supabase
    .from('auth.sessions')
    .select('*')
    .eq('user_id', adam.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (sessions && sessions.length > 0) {
    console.log(`\n🔐 Recent sessions: ${sessions.length}`);
    sessions.forEach((s: any) => {
      console.log(`   - Created: ${s.created_at}, Expires: ${s.not_after || 'Unknown'}`);
    });
  }

  console.log('\n✨ Done');
}

checkAdamSession().catch(console.error);
