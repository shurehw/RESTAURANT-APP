import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRivaniScenarios() {
  console.log('🔍 Checking Rivani Speakeasy scenarios...\n');

  // Get Rivani project
  const { data: rivani } = await supabase
    .from('proforma_projects')
    .select('id, name')
    .eq('name', 'Rivani Speakeasy')
    .single();

  if (!rivani) {
    console.error('❌ Rivani Speakeasy not found');
    return;
  }

  console.log(`📋 Project: ${rivani.name} (${rivani.id})\n`);

  // Check scenarios
  const { data: scenarios, error: scenarioError } = await supabase
    .from('proforma_scenarios')
    .select('*')
    .eq('project_id', rivani.id)
    .order('created_at', { ascending: true });

  if (scenarioError) {
    console.error('❌ Error fetching scenarios:', scenarioError);
    return;
  }

  console.log(`📊 Scenarios: ${scenarios?.length || 0}\n`);

  if (scenarios && scenarios.length > 0) {
    scenarios.forEach(s => {
      console.log(`✅ ${s.name} ${s.is_base ? '(BASE)' : ''}`);
      console.log(`   - ID: ${s.id}`);
      console.log(`   - Months: ${s.months}`);
      console.log(`   - Start: ${s.start_month}`);
      console.log('');
    });
  } else {
    console.log('⚠️  No scenarios found for Rivani Speakeasy');
    console.log('   This is why the UI only shows "rivani speakeasy in the gray bar"');
    console.log('   The user needs to create a Base scenario first.');
  }

  // Check project-level revenue centers and service periods
  const { data: revCenters } = await supabase
    .from('revenue_centers')
    .select('*')
    .eq('project_id', rivani.id);

  console.log(`\n📍 Project-level Revenue Centers: ${revCenters?.length || 0}`);
  revCenters?.forEach(rc => {
    console.log(`   - ${rc.name}: ${rc.total_seats} seats`);
  });

  const { data: servicePeriods } = await supabase
    .from('service_periods')
    .select('*')
    .eq('project_id', rivani.id);

  console.log(`\n📅 Project-level Service Periods: ${servicePeriods?.length || 0}`);
  servicePeriods?.forEach(sp => {
    console.log(`   - ${sp.name}: ${sp.days_per_week}d/wk, ${sp.turns_per_day} turns`);
  });

  console.log('\n✅ Check complete!');
}

checkRivaniScenarios();
