import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createScenarioRevenueData() {
  console.log('🔍 Creating scenario-level revenue data for Rivani Speakeasy...\n');

  // Get Rivani project
  const { data: project } = await supabase
    .from('proforma_projects')
    .select('id, name')
    .eq('name', 'Rivani Speakeasy')
    .single();

  if (!project) {
    console.error('❌ Rivani Speakeasy not found');
    return;
  }

  console.log(`📋 Project: ${project.name} (${project.id})\n`);

  // Get scenarios
  const { data: scenarios } = await supabase
    .from('proforma_scenarios')
    .select('id, name')
    .eq('project_id', project.id);

  console.log(`📊 Scenarios: ${scenarios?.length || 0}\n`);

  // Get project-level revenue centers and service periods
  const { data: projectRC } = await supabase
    .from('revenue_centers')
    .select('*')
    .eq('project_id', project.id)
    .order('display_order');

  const { data: projectSP } = await supabase
    .from('service_periods')
    .select('*')
    .eq('project_id', project.id)
    .order('display_order');

  console.log(`Project-level data:`);
  console.log(`  - Revenue Centers: ${projectRC?.length || 0}`);
  console.log(`  - Service Periods: ${projectSP?.length || 0}\n`);

  // For each scenario, create scenario-level revenue centers and service periods
  for (const scenario of scenarios || []) {
    console.log(`\n📌 Processing scenario: ${scenario.name} (${scenario.id})`);

    // Check existing scenario-level revenue centers
    const { data: existingRC } = await supabase
      .from('proforma_revenue_centers')
      .select('id')
      .eq('scenario_id', scenario.id);

    if (existingRC && existingRC.length > 0) {
      console.log(`   ⏭️  Already has ${existingRC.length} revenue centers, skipping`);
    } else {
      // Create scenario-level revenue centers from project-level
      const scenarioRC = projectRC?.map(rc => ({
        scenario_id: scenario.id,
        center_name: rc.name,
        seats: rc.total_seats,
        sort_order: rc.display_order
      }));

      if (scenarioRC && scenarioRC.length > 0) {
        const { error: rcError } = await supabase
          .from('proforma_revenue_centers')
          .insert(scenarioRC);

        if (rcError) {
          console.error(`   ❌ Error creating revenue centers:`, rcError);
        } else {
          console.log(`   ✅ Created ${scenarioRC.length} revenue centers`);
        }
      }
    }

    // Check existing scenario-level service periods
    const { data: existingSP } = await supabase
      .from('proforma_revenue_service_periods')
      .select('id')
      .eq('scenario_id', scenario.id);

    if (existingSP && existingSP.length > 0) {
      console.log(`   ⏭️  Already has ${existingSP.length} service periods, skipping`);
    } else {
      // Create scenario-level service periods from project-level
      const scenarioSP = projectSP?.map(sp => ({
        scenario_id: scenario.id,
        service_name: sp.name,
        avg_covers_per_service: 0, // Will be configured in UI
        avg_check: sp.avg_check,
        avg_food_check: sp.avg_check * 0.6, // 60% food
        avg_bev_check: sp.avg_check * 0.4, // 40% bev
        food_pct: 60, // Default
        bev_pct: 35, // Default
        other_pct: 5, // Default
        days_per_week: sp.days_per_week,
        sort_order: sp.display_order
      }));

      if (scenarioSP && scenarioSP.length > 0) {
        const { error: spError } = await supabase
          .from('proforma_revenue_service_periods')
          .insert(scenarioSP);

        if (spError) {
          console.error(`   ❌ Error creating service periods:`, spError);
        } else {
          console.log(`   ✅ Created ${scenarioSP.length} service periods`);
        }
      }
    }
  }

  console.log('\n🎉 Complete!');
}

createScenarioRevenueData();
