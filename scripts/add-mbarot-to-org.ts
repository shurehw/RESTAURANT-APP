import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Adding mbarot@hwoodgroup.com to organization...\n');

  // Get the user ID
  const { data: users, error: userError } = await supabase
    .from('auth.users')
    .select('id, email')
    .eq('email', 'mbarot@hwoodgroup.com')
    .single();

  if (userError || !users) {
    console.error('User not found. They need to sign up first.');
    console.log('Please have them sign up at your app, then run this script again.');
    return;
  }

  console.log(`✓ Found user: ${users.email} (${users.id})`);

  // Get all organizations
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('is_active', true);

  if (!orgs || orgs.length === 0) {
    console.log('\n❌ No organizations found. Creating default organization...');

    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: 'Hwood Group',
        plan: 'enterprise',
        subscription_status: 'active'
      })
      .select()
      .single();

    if (orgError || !newOrg) {
      console.error('Error creating organization:', orgError);
      return;
    }

    console.log(`✓ Created organization: ${newOrg.name}`);
    orgs.push(newOrg);
  }

  console.log('\nAvailable organizations:');
  orgs.forEach((org, i) => console.log(`  ${i + 1}. ${org.name} (${org.id})`));

  // Add user to first organization (or you can manually select)
  const selectedOrg = orgs[0];

  const { error: linkError } = await supabase
    .from('organization_users')
    .insert({
      organization_id: selectedOrg.id,
      user_id: users.id,
      role: 'admin',
      is_active: true
    });

  if (linkError) {
    if (linkError.code === '23505') {
      console.log('\n✓ User already linked to organization');
    } else {
      console.error('Error linking user to organization:', linkError);
      return;
    }
  } else {
    console.log(`\n✓ Added ${users.email} to ${selectedOrg.name} as admin`);
  }

  console.log('\n✅ Done! User can now access proforma and all features.');
}

main();
