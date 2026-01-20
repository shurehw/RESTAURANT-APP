import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixBarCenter() {
  console.log('🔧 Fixing Bar center properties...\n');

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

  // Update Bar center to have is_bar=true and bar_mode='seated'
  const { data: updatedBar, error } = await supabase
    .from('proforma_revenue_centers')
    .update({
      is_bar: true,
      bar_mode: 'seated'
    })
    .eq('scenario_id', scenario.id)
    .ilike('center_name', '%bar%')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating bar center:', error);
  } else {
    console.log('✅ Updated Bar center:');
    console.log(`   - ${updatedBar.center_name}`);
    console.log(`   - is_bar: ${updatedBar.is_bar}`);
    console.log(`   - bar_mode: ${updatedBar.bar_mode}`);
  }

  console.log('\n✅ Fix complete!');
}

fixBarCenter();
