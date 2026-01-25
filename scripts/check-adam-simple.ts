import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdam() {
  console.log('🔍 Checking Adam Vieli\n');

  // Check if user exists in organization_users
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select(`
      user_id,
      role,
      is_active,
      organizations(name)
    `)
    .or('user_id.eq.95d4835e-5c69-47e7-9f7a-a65c6e71b8db,user_id.ilike.%adam%,user_id.ilike.%vieli%');

  console.log('Organization users found:', orgUsers?.length || 0);

  if (orgUsers && orgUsers.length > 0) {
    orgUsers.forEach(ou => {
      console.log(`✅ User ID: ${ou.user_id}`);
      console.log(`   Org: ${(ou.organizations as any)?.name}`);
      console.log(`   Role: ${ou.role}`);
      console.log(`   Active: ${ou.is_active}`);
      console.log('');
    });
  } else {
    console.log('❌ No organization users found for Adam');
  }

  // Try to find by email pattern in a users table if it exists
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .or('email.ilike.%adam%,email.ilike.%vieli%')
    .limit(5);

  if (profiles && profiles.length > 0) {
    console.log('\n📧 Found in profiles:');
    profiles.forEach(p => {
      console.log(`   ${p.email} (ID: ${p.id})`);
    });
  }

  console.log('\n✨ Done');
}

checkAdam().catch(console.error);
