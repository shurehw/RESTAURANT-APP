import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function addHarshToOrg() {
  console.log('Looking for Harsh\'s user account...');

  // Find Harsh's user ID
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();

  if (userError) {
    console.error('Error fetching users:', userError);
    return;
  }

  const harshUser = userData.users.find(u =>
    u.email === 'harsh@thebinyagroup.com' || u.email === 'harsh@hwoodgroup.com'
  );

  if (!harshUser) {
    console.error('Harsh not found. Available emails:', userData.users.map(u => u.email));
    return;
  }

  console.log('Found Harsh:', harshUser.email, harshUser.id);

  // Find Jacob's organization (assuming you're jacob@hwoodgroup.com)
  const { data: jacobOrgData, error: jacobOrgError } = await supabase
    .from('organization_users')
    .select('organization_id, organizations(name)')
    .eq('user_id', '88e82503-9816-4f4e-aa74-7049583d230b') // Jacob's ID from logs
    .single();

  if (jacobOrgError) {
    console.error('Error finding Jacob\'s org:', jacobOrgError);
    return;
  }

  const orgId = jacobOrgData.organization_id;
  console.log('Adding Harsh to organization:', jacobOrgData.organizations);

  // Add Harsh to the organization
  const { data: addData, error: addError } = await supabase
    .from('organization_users')
    .upsert({
      organization_id: orgId,
      user_id: harshUser.id,
      role: 'admin',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,user_id'
    })
    .select();

  if (addError) {
    console.error('Error adding Harsh to org:', addError);
    return;
  }

  console.log('✅ Successfully added Harsh to organization!', addData);
}

addHarshToOrg().catch(console.error);
