import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('Finding ALL proforma projects...\n');

  const { data: projects } = await supabase
    .from('proforma_projects')
    .select(`
      id,
      name,
      org_id,
      organizations(name)
    `)
    .order('created_at', { ascending: false });

  if (!projects || projects.length === 0) {
    console.log('No projects found');
    return;
  }

  console.log(`Found ${projects.length} projects:\n`);

  for (const project of projects) {
    console.log(`📁 ${project.name}`);
    console.log(`   Organization: ${(project.organizations as any)?.name || 'Unknown'}`);
    console.log(`   Org ID: ${project.org_id}`);
    console.log(`   Project ID: ${project.id}`);

    // Check for revenue centers and service periods
    const { data: revCenters } = await supabase
      .from('revenue_centers')
      .select('id, name')
      .eq('project_id', project.id);

    const { data: servicePeriods } = await supabase
      .from('service_periods')
      .select('id, name')
      .eq('project_id', project.id);

    console.log(`   Revenue Centers: ${revCenters?.length || 0}`);
    if (revCenters && revCenters.length > 0) {
      revCenters.forEach(rc => console.log(`     - ${rc.name}`));
    }

    console.log(`   Service Periods: ${servicePeriods?.length || 0}`);
    if (servicePeriods && servicePeriods.length > 0) {
      servicePeriods.forEach(sp => console.log(`     - ${sp.name}`));
    }

    console.log('');
  }

  console.log('\n💡 To share projects with mbarot, add them to the same organization.');
  console.log('Mbarot is currently in organization: Hwood Group');
}

main();
