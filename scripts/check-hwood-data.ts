import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkHwoodData() {
  console.log('🔍 Checking Hwood Group Data\n');

  const hwoodOrgId = 'f94d6149-f107-4498-937f-47fe81377dba';

  // Check GL accounts
  console.log('1️⃣  GL ACCOUNTS');
  const { data: glAccounts } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name, section, is_active, is_summary')
    .eq('org_id', hwoodOrgId)
    .limit(10);

  console.log(`   Total: ${glAccounts?.length || 0}`);
  if (glAccounts && glAccounts.length > 0) {
    const active = glAccounts.filter(g => g.is_active && !g.is_summary);
    console.log(`   Active & usable: ${active.length}`);
    console.log('   Sample:');
    active.slice(0, 3).forEach(gl => {
      console.log(`      ${gl.external_code} - ${gl.name} (${gl.section})`);
    });
  }

  // Check venues
  console.log('\n2️⃣  VENUES');
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, is_active')
    .eq('organization_id', hwoodOrgId);

  console.log(`   Total: ${venues?.length || 0}`);
  if (venues && venues.length > 0) {
    venues.forEach(v => {
      console.log(`      ${v.name} (${v.is_active ? 'Active' : 'Inactive'})`);
    });
  }

  // Check items
  console.log('\n3️⃣  ITEMS');
  const { data: items } = await supabase
    .from('items')
    .select('id, name, category')
    .eq('organization_id', hwoodOrgId)
    .limit(5);

  console.log(`   Total (showing 5): ${items?.length || 0}`);

  // Check vendors
  console.log('\n4️⃣  VENDORS');
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', hwoodOrgId)
    .limit(5);

  console.log(`   Total (showing 5): ${vendors?.length || 0}`);

  console.log('\n✨ Done');
}

checkHwoodData().catch(console.error);
