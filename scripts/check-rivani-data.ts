import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkRivaniData() {
  console.log('🔍 Checking Rivani Speakeasy data...\n');

  // Get the project
  const { data: project, error: projectError } = await supabase
    .from('proforma_projects')
    .select('id, name')
    .eq('name', 'Rivani Speakeasy')
    .single();

  if (projectError) {
    console.error('❌ Error fetching project:', projectError);
    return;
  }

  console.log(`✅ Project: ${project.name} (${project.id})\n`);

  // Check revenue centers
  const { data: revCenters, error: rcError } = await supabase
    .from('revenue_centers')
    .select('*')
    .eq('project_id', project.id);

  if (rcError) {
    console.error('❌ Error fetching revenue centers:', rcError);
  } else {
    console.log(`📊 Revenue Centers (${revCenters?.length || 0}):`);
    revCenters?.forEach(rc => {
      console.log(`   - ${rc.name}: ${rc.total_seats} seats (primary: ${rc.is_primary})`);
    });
  }

  console.log('');

  // Check service periods
  const { data: servicePeriods, error: spError } = await supabase
    .from('service_periods')
    .select('*')
    .eq('project_id', project.id);

  if (spError) {
    console.error('❌ Error fetching service periods:', spError);
  } else {
    console.log(`📅 Service Periods (${servicePeriods?.length || 0}):`);
    servicePeriods?.forEach(sp => {
      console.log(`   - ${sp.name}: ${sp.days_per_week}d/wk, ${sp.turns_per_day} turns, $${sp.avg_check} avg check`);
    });
  }

  console.log('\n✅ Check complete!');
}

checkRivaniData();
