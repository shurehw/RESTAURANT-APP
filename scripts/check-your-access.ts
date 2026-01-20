import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkYourAccess() {
  console.log('🔍 Checking all users and their access to Rivani...\n');

  // Get all users
  const { data: allUsers } = await supabase.auth.admin.listUsers();

  console.log(`Total users: ${allUsers?.users.length || 0}\n`);

  // Get Rivani project
  const { data: rivani } = await supabase
    .from('proforma_projects')
    .select('id, name, org_id')
    .eq('name', 'Rivani Speakeasy')
    .single();

  console.log(`📋 Rivani Speakeasy:`);
  console.log(`   - Project ID: ${rivani?.id}`);
  console.log(`   - Org ID: ${rivani?.org_id}\n`);

  // Get organization name
  const { data: org } = await supabase
    .from('organizations')
    .select('name, slug')
    .eq('id', rivani?.org_id)
    .single();

  console.log(`🏢 Organization: ${org?.name} (${org?.slug})\n`);

  // Check all users
  for (const user of allUsers?.users || []) {
    const { data: orgUsers } = await supabase
      .from('organization_users')
      .select('organization_id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const hasAccess = orgUsers?.some(ou => ou.organization_id === rivani?.org_id);

    console.log(`${hasAccess ? '✅' : '❌'} ${user.email}`);
    if (hasAccess) {
      console.log(`   → Can access Rivani Speakeasy`);
    } else {
      console.log(`   → Cannot access (org mismatch)`);
      if (orgUsers && orgUsers.length > 0) {
        console.log(`   → User's org(s): ${orgUsers.map(ou => ou.organization_id).join(', ')}`);
      } else {
        console.log(`   → User has no active organizations`);
      }
    }
  }

  console.log('\n📊 Revenue Centers and Service Periods:\n');

  const { data: revCenters } = await supabase
    .from('revenue_centers')
    .select('*')
    .eq('project_id', rivani?.id);

  console.log(`Revenue Centers: ${revCenters?.length || 0}`);
  revCenters?.forEach(rc => {
    console.log(`   - ${rc.name}: ${rc.total_seats} seats (primary: ${rc.is_primary})`);
  });

  const { data: servicePeriods } = await supabase
    .from('service_periods')
    .select('*')
    .eq('project_id', rivani?.id);

  console.log(`\nService Periods: ${servicePeriods?.length || 0}`);
  servicePeriods?.forEach(sp => {
    console.log(`   - ${sp.name}: ${sp.days_per_week}d/wk, ${sp.turns_per_day} turns, $${sp.avg_check}`);
  });

  console.log('\n✅ Check complete!');
}

checkYourAccess();
