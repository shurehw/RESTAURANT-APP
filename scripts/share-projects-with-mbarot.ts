import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const mbarotUserId = '0bdd553b-1493-47d8-a79e-5cd22aba2212';

  console.log('Finding organizations for both users...\n');

  // Get your organization(s)
  const { data: yourOrgUsers } = await supabase
    .from('organization_users')
    .select('organization_id, organizations(name)')
    .neq('user_id', mbarotUserId)
    .eq('is_active', true);

  // Get mbarot's organization
  const { data: mbarotOrgUsers } = await supabase
    .from('organization_users')
    .select('organization_id, organizations(name)')
    .eq('user_id', mbarotUserId)
    .eq('is_active', true);

  if (!yourOrgUsers || yourOrgUsers.length === 0) {
    console.log('❌ No organizations found for you');
    return;
  }

  if (!mbarotOrgUsers || mbarotOrgUsers.length === 0) {
    console.log('❌ Mbarot not linked to any organization yet');
    console.log('Please run the organization linking SQL first');
    return;
  }

  console.log('Your organizations:');
  yourOrgUsers.forEach(ou => console.log(`  - ${(ou.organizations as any).name}`));

  console.log('\nMbarot\'s organizations:');
  mbarotOrgUsers.forEach(ou => console.log(`  - ${(ou.organizations as any).name}`));

  // Option 1: Add mbarot to YOUR organization
  const yourOrgId = yourOrgUsers[0].organization_id;
  const mbarotOrgId = mbarotOrgUsers[0].organization_id;

  if (yourOrgId === mbarotOrgId) {
    console.log('\n✓ Already in the same organization!');
  } else {
    console.log('\n⚠️  Different organizations detected');
    console.log('Option 1: Add mbarot to your organization');
    console.log('Option 2: Move your projects to their organization');
    console.log('\nWhich would you prefer? (This script will show both options)');
  }

  // Show all projects
  const { data: yourProjects } = await supabase
    .from('proforma_projects')
    .select('id, name, org_id')
    .eq('org_id', yourOrgId);

  console.log('\nYour projects:');
  if (yourProjects && yourProjects.length > 0) {
    yourProjects.forEach(p => console.log(`  - ${p.name} (${p.id})`));

    console.log('\n📋 SQL to add mbarot to your organization:');
    console.log(`
INSERT INTO organization_users (organization_id, user_id, role, is_active)
VALUES ('${yourOrgId}', '${mbarotUserId}', 'admin', true)
ON CONFLICT (organization_id, user_id) DO UPDATE
SET is_active = true, role = 'admin';
    `);
  } else {
    console.log('  (none found)');
  }

  // Check for projects without revenue centers
  console.log('\n🔍 Checking for projects missing revenue centers/service periods...\n');

  for (const project of yourProjects || []) {
    const { data: revCenters } = await supabase
      .from('revenue_centers')
      .select('id')
      .eq('project_id', project.id);

    const { data: servicePeriods } = await supabase
      .from('service_periods')
      .select('id')
      .eq('project_id', project.id);

    if (!revCenters || revCenters.length === 0) {
      console.log(`  ⚠️  Project "${project.name}" has NO revenue centers`);
    }

    if (!servicePeriods || servicePeriods.length === 0) {
      console.log(`  ⚠️  Project "${project.name}" has NO service periods`);
    }

    if (revCenters && revCenters.length > 0 && servicePeriods && servicePeriods.length > 0) {
      console.log(`  ✓ Project "${project.name}" has ${revCenters.length} revenue centers and ${servicePeriods.length} service periods`);
    }
  }
}

main();
