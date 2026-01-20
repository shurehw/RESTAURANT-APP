import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkParticipationData() {
  console.log('🔍 Checking Center Participation data for Rivani...\n');

  // Get Rivani Base scenario
  const { data: scenario } = await supabase
    .from('proforma_scenarios')
    .select('id, name, project_id')
    .eq('project_id', 'd5d2291e-a507-4425-b8e5-6c68a6344346')
    .eq('name', 'Base')
    .single();

  if (!scenario) {
    console.error('❌ Base scenario not found');
    return;
  }

  console.log(`📋 Scenario: ${scenario.name} (${scenario.id})\n`);

  // Check revenue centers
  const { data: centers } = await supabase
    .from('proforma_revenue_centers')
    .select('*')
    .eq('scenario_id', scenario.id);

  console.log(`📊 Revenue Centers: ${centers?.length || 0}`);
  centers?.forEach(c => {
    console.log(`   - ${c.center_name}: ${c.seats} seats`);
  });

  // Check service periods
  const { data: periods } = await supabase
    .from('proforma_revenue_service_periods')
    .select('*')
    .eq('scenario_id', scenario.id);

  console.log(`\n📅 Service Periods: ${periods?.length || 0}`);
  periods?.forEach(p => {
    console.log(`   - ${p.service_name}: ${p.days_per_week}d/wk, avg_check: $${p.avg_check}`);
  });

  // Check participation records
  const { data: participation, error: partError } = await supabase
    .from('proforma_center_service_participation')
    .select('*')
    .in('revenue_center_id', centers?.map(c => c.id) || []);

  console.log(`\n🔗 Participation Records: ${participation?.length || 0}`);
  if (partError) {
    console.error('   Error:', partError);
  } else if (participation && participation.length > 0) {
    participation.forEach((p: any) => {
      const center = centers?.find(c => c.id === p.revenue_center_id);
      const period = periods?.find(sp => sp.id === p.service_period_id);
      console.log(`   - ${center?.center_name} × ${period?.service_name}: ${p.is_active ? '✅ Active' : '❌ Inactive'}`);
    });
  } else {
    console.log('   ⚠️  No participation records found - this is why clicking doesn\'t work!');
  }

  console.log('\n✅ Check complete!');
}

checkParticipationData();
