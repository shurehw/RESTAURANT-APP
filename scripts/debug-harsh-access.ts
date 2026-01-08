import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function debug() {
  const harshUserId = 'bf76f87f-f463-4074-b1b7-2dbdb502a120';

  console.log('=== HARSH DEBUG ===\n');

  // 1. Check user exists
  const { data: authUser } = await supabase.auth.admin.getUserById(harshUserId);
  console.log('1. Auth User:', authUser.user?.email, authUser.user?.id);

  // 2. Check org memberships
  const { data: orgMemberships, error: orgError } = await supabase
    .from('organization_users')
    .select('organization_id, role, is_active, organizations(name)')
    .eq('user_id', harshUserId);

  console.log('\n2. Organization Memberships:', orgError || orgMemberships);

  // 3. Get first org (what the page will use)
  const { data: firstOrg, error: firstOrgError } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', harshUserId)
    .eq('is_active', true)
    .limit(1)
    .single();

  console.log('\n3. First Org (what page uses):', firstOrgError || firstOrg);

  if (firstOrg?.organization_id) {
    // 4. Check projects for that org
    const { data: projects, error: projError } = await supabase
      .from('proforma_projects')
      .select('id, name, org_id')
      .eq('org_id', firstOrg.organization_id);

    console.log('\n4. Projects for first org:', projError || projects);
  }

  // 5. Check RLS policies - simulate Harsh's query
  console.log('\n5. Testing RLS (as Harsh would see it):');

  // We can't easily test RLS with service key, but we can check the query
  const { data: rlsTest, error: rlsError } = await supabase
    .from('proforma_projects')
    .select('*')
    .in('org_id', orgMemberships?.map(o => o.organization_id) || []);

  console.log('   Projects Harsh should see:', rlsError || `${rlsTest?.length} projects`);
  if (rlsTest) {
    rlsTest.forEach(p => console.log(`   - ${p.name} (${p.id})`));
  }
}

debug().catch(console.error);
