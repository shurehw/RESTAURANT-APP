import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debugGLAccounts() {
  console.log('🔍 Debugging GL Accounts Issue\n');

  const correctOrgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group

  // Check total GL accounts for this org
  console.log('1️⃣  Total GL accounts:');
  const { data: allGL, count: totalCount } = await supabase
    .from('gl_accounts')
    .select('*', { count: 'exact' })
    .eq('org_id', correctOrgId);

  console.log(`   Total: ${totalCount || 0}`);

  if (allGL && allGL.length > 0) {
    // Check sections
    const sections = new Set(allGL.map(g => g.section));
    console.log(`   Sections found: ${Array.from(sections).join(', ')}\n`);

    // Check active, non-summary
    console.log('2️⃣  Active & non-summary GL accounts:');
    const active = allGL.filter(g => g.is_active && !g.is_summary);
    console.log(`   Count: ${active.length}`);

    // Check COGS/Opex specifically
    console.log('\n3️⃣  COGS & Opex only:');
    const cogsOpex = active.filter(g => g.section === 'COGS' || g.section === 'Opex');
    console.log(`   Count: ${cogsOpex.length}`);

    if (cogsOpex.length > 0) {
      console.log('   Sample:');
      cogsOpex.slice(0, 5).forEach(gl => {
        console.log(`      ${gl.external_code || 'N/A'} - ${gl.name} (${gl.section})`);
      });
    }

    // Show what sections exist
    console.log('\n4️⃣  Section breakdown (active, non-summary):');
    const sectionCounts: Record<string, number> = {};
    active.forEach(g => {
      sectionCounts[g.section] = (sectionCounts[g.section] || 0) + 1;
    });
    Object.entries(sectionCounts).forEach(([section, count]) => {
      console.log(`      ${section}: ${count}`);
    });
  } else {
    console.log('   ❌ No GL accounts found for this org_id');

    // Check if GL accounts exist with different org_id
    console.log('\n   Checking other org_ids...');
    const { data: otherGL } = await supabase
      .from('gl_accounts')
      .select('org_id')
      .limit(10);

    if (otherGL) {
      const orgIds = new Set(otherGL.map(g => g.org_id));
      console.log(`   Found GL accounts with org_ids: ${Array.from(orgIds).join(', ')}`);
    }
  }

  console.log('\n✨ Done');
}

debugGLAccounts().catch(console.error);
