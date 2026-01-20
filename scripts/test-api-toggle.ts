import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAPIToggle() {
  console.log('🧪 Testing API toggle for Bar × Dinner...\n');

  // Get Rivani Base scenario
  const { data: scenario } = await supabase
    .from('proforma_scenarios')
    .select('id')
    .eq('project_id', 'd5d2291e-a507-4425-b8e5-6c68a6344346')
    .eq('name', 'Base')
    .single();

  // Get Bar center
  const { data: barCenter } = await supabase
    .from('proforma_revenue_centers')
    .select('id, center_name')
    .eq('scenario_id', scenario?.id)
    .ilike('center_name', '%bar%')
    .single();

  // Get Dinner period
  const { data: dinnerPeriod } = await supabase
    .from('proforma_revenue_service_periods')
    .select('id, service_name')
    .eq('scenario_id', scenario?.id)
    .eq('service_name', 'Dinner')
    .single();

  console.log(`Bar: ${barCenter?.center_name} (${barCenter?.id})`);
  console.log(`Dinner: ${dinnerPeriod?.service_name} (${dinnerPeriod?.id})\n`);

  // Check current participation
  const { data: currentParticipation } = await supabase
    .from('proforma_center_service_participation')
    .select('*')
    .eq('revenue_center_id', barCenter?.id)
    .eq('service_period_id', dinnerPeriod?.id)
    .maybeSingle();

  console.log('Current participation:', currentParticipation?.is_active ? '✅ Active' : '❌ Inactive');

  // Toggle it (activate if inactive, deactivate if active)
  const newState = !currentParticipation?.is_active;
  console.log(`\n🔄 Toggling to: ${newState ? '✅ Active' : '❌ Inactive'}`);

  const { data: result, error } = await supabase
    .from('proforma_center_service_participation')
    .upsert({
      revenue_center_id: barCenter?.id,
      service_period_id: dinnerPeriod?.id,
      is_active: newState,
      default_utilization_pct: newState ? 70 : undefined,
    }, {
      onConflict: 'revenue_center_id,service_period_id'
    })
    .select()
    .single();

  if (error) {
    console.error('\n❌ Error:', error);
  } else {
    console.log('\n✅ Success!');
    console.log('Result:', {
      is_active: result.is_active,
      default_utilization_pct: result.default_utilization_pct,
    });
  }

  // Verify the change
  const { data: verifyParticipation } = await supabase
    .from('proforma_center_service_participation')
    .select('is_active')
    .eq('revenue_center_id', barCenter?.id)
    .eq('service_period_id', dinnerPeriod?.id)
    .single();

  console.log('\n📋 Verified state:', verifyParticipation?.is_active ? '✅ Active' : '❌ Inactive');
}

testAPIToggle();
