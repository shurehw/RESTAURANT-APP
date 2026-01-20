import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugRivaniQuery() {
  console.log('🔍 Simulating the exact page query for Rivani...\n');

  const projectId = 'd5d2291e-a507-4425-b8e5-6c68a6344346';

  // Get mbarot's org
  const { data: users } = await supabase.auth.admin.listUsers();
  const mbarot = users?.users.find(u => u.email === 'mbarot@hwoodgroup.com');

  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', mbarot?.id)
    .eq('is_active', true)
    .single();

  console.log(`User org: ${orgUsers?.organization_id}\n`);

  // This is the EXACT query from the page
  const { data: project, error } = await supabase
    .from('proforma_projects')
    .select(
      `
      *,
      revenue_centers (*),
      service_periods (*),
      proforma_scenarios (
        id,
        name,
        is_base,
        months,
        start_month,
        preopening_start_month,
        opening_month,
        proforma_revenue_assumptions (*),
        proforma_cogs_assumptions (*),
        proforma_labor_assumptions (*),
        proforma_occupancy_opex_assumptions (*),
        proforma_capex_assumptions (*),
        proforma_preopening_assumptions (*)
      )
    `
    )
    .eq('id', projectId)
    .eq('org_id', orgUsers?.organization_id || '')
    .single();

  if (error) {
    console.error('❌ Query ERROR:', error);
    console.error('   Code:', error.code);
    console.error('   Message:', error.message);
    console.error('   Details:', error.details);
    console.error('   Hint:', error.hint);
  } else {
    console.log('✅ Query succeeded!\n');
    console.log(`Project: ${project.name}`);
    console.log(`Revenue Centers: ${project.revenue_centers?.length || 0}`);
    console.log(`Service Periods: ${project.service_periods?.length || 0}`);
    console.log(`Scenarios: ${project.proforma_scenarios?.length || 0}\n`);

    if (project.proforma_scenarios && project.proforma_scenarios.length > 0) {
      console.log('Scenarios:');
      project.proforma_scenarios.forEach((s: any) => {
        console.log(`  - ${s.name} ${s.is_base ? '(BASE)' : ''}`);
        console.log(`    Revenue assumptions: ${s.proforma_revenue_assumptions?.length || 0}`);
        console.log(`    COGS assumptions: ${s.proforma_cogs_assumptions?.length || 0}`);
      });
    } else {
      console.log('⚠️  NO SCENARIOS RETURNED - This is the problem!');
    }
  }

  console.log('\n✅ Debug complete!');
}

debugRivaniQuery();
