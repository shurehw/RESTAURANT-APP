import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testGLFiltering() {
  console.log('🧪 Testing GL Account Filtering\n');

  // Get Hwood Group
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('name', 'Hwood Group')
    .single();

  if (!org) {
    console.error('❌ Org not found');
    return;
  }

  console.log(`Organization: ${org.name}\n`);

  // Get ALL accounts (before filtering)
  const { data: allAccounts } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name, section, is_active, is_summary')
    .eq('org_id', org.id);

  console.log('📊 All GL Accounts by Section:');
  const sectionCounts: Record<string, number> = {};
  allAccounts?.forEach(acc => {
    sectionCounts[acc.section] = (sectionCounts[acc.section] || 0) + 1;
  });
  Object.entries(sectionCounts).forEach(([section, count]) => {
    console.log(`  ${section}: ${count} accounts`);
  });

  // Get filtered accounts (COGS + Opex only, active, non-summary)
  const { data: filteredAccounts } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name, section')
    .eq('org_id', org.id)
    .eq('is_active', true)
    .eq('is_summary', false)
    .in('section', ['COGS', 'Opex'])
    .order('section')
    .order('display_order');

  console.log(`\n✅ Filtered GL Accounts (COGS + Opex, active, non-summary): ${filteredAccounts?.length || 0}`);

  const cogsCount = filteredAccounts?.filter(a => a.section === 'COGS').length || 0;
  const opexCount = filteredAccounts?.filter(a => a.section === 'Opex').length || 0;
  console.log(`  COGS: ${cogsCount}`);
  console.log(`  Opex: ${opexCount}`);

  console.log('\nSample COGS accounts:');
  filteredAccounts?.filter(a => a.section === 'COGS').slice(0, 5).forEach(acc => {
    console.log(`  ${acc.external_code || 'N/A'} - ${acc.name}`);
  });

  console.log('\nSample Opex accounts:');
  filteredAccounts?.filter(a => a.section === 'Opex').slice(0, 5).forEach(acc => {
    console.log(`  ${acc.external_code || 'N/A'} - ${acc.name}`);
  });

  // Show what sections are being excluded
  const excludedSections = Object.keys(sectionCounts).filter(s => !['COGS', 'Opex'].includes(s));
  if (excludedSections.length > 0) {
    console.log(`\n🚫 Excluded sections: ${excludedSections.join(', ')}`);
    excludedSections.forEach(section => {
      console.log(`  ${section}: ${sectionCounts[section]} accounts (not shown in dropdown)`);
    });
  }

  console.log('\n✨ Done');
}

testGLFiltering().catch(console.error);
