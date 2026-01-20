import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyRLSQuery() {
  console.log('🔍 Verifying RLS query logic...\n');

  // Get mbarot
  const { data: users } = await supabase.auth.admin.listUsers();
  const mbarot = users?.users.find(u => u.email === 'mbarot@hwoodgroup.com');

  if (!mbarot) {
    console.error('❌ mbarot not found');
    return;
  }

  console.log(`User ID: ${mbarot.id}\n`);

  // Simulate the RLS policy check manually
  console.log('📋 Testing RLS policy logic manually:\n');

  // Step 1: Get mbarot's active organizations
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id, is_active')
    .eq('user_id', mbarot.id)
    .eq('is_active', true);

  console.log(`Step 1 - User's active organizations: ${orgUsers?.length || 0}`);
  orgUsers?.forEach(ou => console.log(`   - ${ou.organization_id}`));

  // Step 2: Get Rivani project
  const { data: rivani } = await supabase
    .from('proforma_projects')
    .select('id, org_id')
    .eq('name', 'Rivani Speakeasy')
    .single();

  console.log(`\nStep 2 - Rivani Speakeasy:`);
  console.log(`   - Project ID: ${rivani?.id}`);
  console.log(`   - Org ID: ${rivani?.org_id}`);

  // Step 3: Check if user's org matches
  const hasAccess = orgUsers?.some(ou => ou.organization_id === rivani?.org_id);
  console.log(`\nStep 3 - RLS Check: ${hasAccess ? '✅ PASS' : '❌ FAIL'}`);

  // Step 4: Verify the actual RLS policy query would work
  const { data: projectsViaRLS } = await supabase
    .from('proforma_projects')
    .select('id, name')
    .in('org_id', orgUsers?.map(ou => ou.organization_id) || []);

  console.log(`\nStep 4 - Projects user can see via RLS: ${projectsViaRLS?.length || 0}`);
  projectsViaRLS?.forEach(p => console.log(`   - ${p.name}`));

  // Step 5: Check revenue_centers with the same logic
  if (rivani?.id) {
    const { data: revCenters, error } = await supabase
      .from('revenue_centers')
      .select('*')
      .eq('project_id', rivani.id);

    console.log(`\nStep 5 - Revenue centers for Rivani: ${revCenters?.length || 0}`);
    if (error) {
      console.error('   Error:', error);
    } else {
      revCenters?.forEach(rc => console.log(`   - ${rc.name}: ${rc.total_seats} seats`));
    }

    // Manually check if RLS would allow this
    const { data: projectsForRC } = await supabase
      .from('proforma_projects')
      .select('id')
      .eq('id', rivani.id)
      .in('org_id', orgUsers?.map(ou => ou.organization_id) || []);

    console.log(`\nStep 6 - RLS policy check for revenue_centers:`);
    console.log(`   project_id IN (SELECT id FROM proforma_projects WHERE org_id IN (user's orgs))`);
    console.log(`   Result: ${projectsForRC?.length ? '✅ PASS - revenue_centers should be visible' : '❌ FAIL - revenue_centers blocked'}`);
  }

  console.log('\n✅ Verification complete!');
}

verifyRLSQuery();
