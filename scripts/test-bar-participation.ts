import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testBarParticipation() {
  console.log('🔍 Testing Bar center participation...\n');

  // Get Rivani Base scenario
  const { data: scenario } = await supabase
    .from('proforma_scenarios')
    .select('id, name')
    .eq('project_id', 'd5d2291e-a507-4425-b8e5-6c68a6344346')
    .eq('name', 'Base')
    .single();

  if (!scenario) {
    console.error('❌ Scenario not found');
    return;
  }

  // Get Bar center
  const { data: barCenter } = await supabase
    .from('proforma_revenue_centers')
    .select('*')
    .eq('scenario_id', scenario.id)
    .ilike('center_name', '%bar%')
    .single();

  if (!barCenter) {
    console.error('❌ Bar center not found');
    return;
  }

  console.log(`📊 Bar Center: ${barCenter.center_name} (${barCenter.id})`);
  console.log(`   - is_bar: ${barCenter.is_bar}`);
  console.log(`   - bar_mode: ${barCenter.bar_mode || 'null'}\n`);

  // Get Lunch service period
  const { data: lunchPeriod } = await supabase
    .from('proforma_revenue_service_periods')
    .select('*')
    .eq('scenario_id', scenario.id)
    .eq('service_name', 'Lunch')
    .single();

  if (!lunchPeriod) {
    console.error('❌ Lunch period not found');
    return;
  }

  console.log(`📅 Lunch Service Period: ${lunchPeriod.id}\n`);

  // Try to toggle participation
  console.log('🔄 Testing participation toggle...');

  const { data: toggleResult, error: toggleError } = await supabase
    .from('proforma_center_service_participation')
    .upsert({
      revenue_center_id: barCenter.id,
      service_period_id: lunchPeriod.id,
      is_active: true,
      default_utilization_pct: 70,
    }, {
      onConflict: 'revenue_center_id,service_period_id'
    })
    .select()
    .single();

  if (toggleError) {
    console.error('❌ Toggle error:', toggleError);
  } else {
    console.log('✅ Toggle successful!');
    console.log('   Result:', toggleResult);
  }

  // Check current participation
  const { data: participation } = await supabase
    .from('proforma_center_service_participation')
    .select('*')
    .eq('revenue_center_id', barCenter.id)
    .eq('service_period_id', lunchPeriod.id)
    .single();

  console.log('\n📋 Current participation record:');
  console.log(participation);

  console.log('\n✅ Test complete!');
}

testBarParticipation();
