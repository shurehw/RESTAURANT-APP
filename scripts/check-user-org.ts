import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkUserOrg() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Checking user and organization setup...\n');

  // Get all users
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }

  console.log(`Total users: ${users.users.length}`);
  users.users.forEach(user => {
    console.log(`  - ${user.email} (${user.id})`);
  });

  // Get all organizations
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select('*');

  if (orgsError) {
    console.error('Error fetching organizations:', orgsError);
    return;
  }

  console.log(`\nTotal organizations: ${orgs?.length || 0}`);
  orgs?.forEach(org => {
    console.log(`  - ${org.name} (${org.id})`);
  });

  // Get all organization_users relationships
  const { data: orgUsers, error: orgUsersError } = await supabase
    .from('organization_users')
    .select('*, organizations(name)');

  if (orgUsersError) {
    console.error('Error fetching organization_users:', orgUsersError);
    return;
  }

  console.log(`\nTotal organization_users: ${orgUsers?.length || 0}`);
  orgUsers?.forEach(ou => {
    const userEmail = users.users.find(u => u.id === ou.user_id)?.email;
    console.log(`  - User: ${userEmail || ou.user_id}`);
    console.log(`    Org: ${(ou.organizations as any)?.name || ou.organization_id}`);
    console.log(`    Active: ${ou.is_active}`);
    console.log('');
  });

  // Check if current user has org association
  if (users.users.length > 0) {
    const firstUser = users.users[0];
    const userOrgAssoc = orgUsers?.find(ou => ou.user_id === firstUser.id);

    if (!userOrgAssoc && orgs && orgs.length > 0) {
      console.log('⚠️  WARNING: User has no organization association!');
      console.log(`Creating organization_users record for ${firstUser.email}...\n`);

      const { data, error } = await supabase
        .from('organization_users')
        .insert({
          user_id: firstUser.id,
          organization_id: orgs[0].id,
          is_active: true,
          role: 'owner'
        })
        .select();

      if (error) {
        console.error('Error creating organization_users:', error);
      } else {
        console.log('✓ Created organization_users record!');
        console.log(data);
      }
    } else if (!userOrgAssoc) {
      console.log('⚠️  WARNING: No organizations exist! Create one first.');
    } else {
      console.log('✓ User has organization association');
    }
  }
}

checkUserOrg().catch(console.error);
