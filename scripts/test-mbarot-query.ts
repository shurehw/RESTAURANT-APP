import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testMbarotQuery() {
  console.log('🔍 Testing query as mbarot@hwoodgroup.com...\n');

  // Get Rivani project ID
  const { data: rivani } = await supabase
    .from('proforma_projects')
    .select('id')
    .eq('name', 'Rivani Speakeasy')
    .single();

  if (!rivani) {
    console.error('❌ Rivani Speakeasy not found');
    return;
  }

  console.log(`📋 Rivani Project ID: ${rivani.id}\n`);

  // Test as service role (should see everything)
  console.log('🔓 Query as SERVICE ROLE:');

  const { data: serviceRoleRC, error: serviceRoleRCError } = await supabase
    .from('revenue_centers')
    .select('*')
    .eq('project_id', rivani.id);

  if (serviceRoleRCError) {
    console.error('   ❌ Revenue centers error:', serviceRoleRCError);
  } else {
    console.log(`   ✅ Revenue centers: ${serviceRoleRC?.length || 0}`);
  }

  const { data: serviceRoleSP, error: serviceRoleSPError } = await supabase
    .from('service_periods')
    .select('*')
    .eq('project_id', rivani.id);

  if (serviceRoleSPError) {
    console.error('   ❌ Service periods error:', serviceRoleSPError);
  } else {
    console.log(`   ✅ Service periods: ${serviceRoleSP?.length || 0}`);
  }

  console.log('\n🔐 Testing RLS policies for mbarot:');

  // Get mbarot's ID
  const { data: users } = await supabase.auth.admin.listUsers();
  const mbarot = users?.users.find(u => u.email === 'mbarot@hwoodgroup.com');

  if (!mbarot) {
    console.error('❌ mbarot user not found');
    return;
  }

  // Create a client with mbarot's session
  const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession({
    user_id: mbarot.id,
  });

  if (sessionError || !sessionData) {
    console.error('❌ Could not create session for mbarot:', sessionError);
    return;
  }

  const mbarotClient = createClient(supabaseUrl, sessionData.session.access_token);

  const { data: mbarotRC, error: mbarotRCError } = await mbarotClient
    .from('revenue_centers')
    .select('*')
    .eq('project_id', rivani.id);

  if (mbarotRCError) {
    console.error('   ❌ Revenue centers error:', mbarotRCError);
  } else {
    console.log(`   ✅ Revenue centers visible to mbarot: ${mbarotRC?.length || 0}`);
    mbarotRC?.forEach(rc => {
      console.log(`      - ${rc.name}: ${rc.total_seats} seats`);
    });
  }

  const { data: mbarotSP, error: mbarotSPError } = await mbarotClient
    .from('service_periods')
    .select('*')
    .eq('project_id', rivani.id);

  if (mbarotSPError) {
    console.error('   ❌ Service periods error:', mbarotSPError);
  } else {
    console.log(`   ✅ Service periods visible to mbarot: ${mbarotSP?.length || 0}`);
    mbarotSP?.forEach(sp => {
      console.log(`      - ${sp.name}: ${sp.days_per_week}d/wk, ${sp.turns_per_day} turns`);
    });
  }

  console.log('\n✅ Test complete!');
}

testMbarotQuery();
