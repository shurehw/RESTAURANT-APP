import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteEmptyOrg() {
  console.log('🗑️  Deleting Empty "Hwood Group" Organization\n');

  const emptyOrgId = 'f94d6149-f107-4498-937f-47fe81377dba'; // Hwood Group (empty)

  // First check if anyone is still linked to it
  const { data: linkedUsers } = await supabase
    .from('organization_users')
    .select('user_id, users(email)')
    .eq('organization_id', emptyOrgId);

  if (linkedUsers && linkedUsers.length > 0) {
    console.log('⚠️  The following users are still linked to this org:');
    linkedUsers.forEach(lu => {
      const user = lu.users as any;
      console.log(`   - ${user?.email || 'Unknown'}`);
    });
    console.log('\nDeleting org_users links first...');

    const { error: deleteUsersError } = await supabase
      .from('organization_users')
      .delete()
      .eq('organization_id', emptyOrgId);

    if (deleteUsersError) {
      console.error('❌ Error deleting org_users:', deleteUsersError);
      return;
    }
    console.log('✅ Removed all user links');
  } else {
    console.log('✅ No users linked to this org');
  }

  // Now delete the organization
  console.log('\nDeleting organization "Hwood Group"...');
  const { error: deleteOrgError } = await supabase
    .from('organizations')
    .delete()
    .eq('id', emptyOrgId);

  if (deleteOrgError) {
    console.error('❌ Error deleting organization:', deleteOrgError);
    return;
  }

  console.log('✅ Empty "Hwood Group" organization deleted');
  console.log('\n📊 Remaining organizations:');

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name');

  orgs?.forEach(org => {
    console.log(`   - ${org.name}`);
  });

  console.log('\n✨ Done');
}

deleteEmptyOrg().catch(console.error);
