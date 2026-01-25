import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkJacobOrg() {
  console.log('🔍 Checking Jacob\'s Organization Membership\n');

  const jacobId = '0121ec40-8732-4ff3-8a50-a866137edf17';
  const jacobEmail = 'jacob@hwoodgroup.com';

  // Check current org membership
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      is_active,
      created_at,
      organizations(id, name)
    `)
    .eq('user_id', jacobId);

  console.log(`📧 Jacob Shure (${jacobEmail})`);
  console.log(`   ID: ${jacobId}\n`);

  if (!orgUsers || orgUsers.length === 0) {
    console.log('   ❌ NOT IN ANY ORGANIZATION!\n');

    // Add to correct org
    const correctOrgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group
    console.log('   Adding to "The h.wood Group"...');

    const { error } = await supabase
      .from('organization_users')
      .insert({
        user_id: jacobId,
        organization_id: correctOrgId,
        role: 'admin',
        is_active: true,
      });

    if (error) {
      console.error('   ❌ Error:', error);
    } else {
      console.log('   ✅ Added successfully');
    }
  } else {
    console.log(`   Organizations (${orgUsers.length}):`);
    orgUsers.forEach(ou => {
      const org = ou.organizations as any;
      console.log(`      - ${org.name} (${ou.role}, ${ou.is_active ? 'Active' : 'Inactive'})`);
      console.log(`        Org ID: ${org.id}`);
      console.log(`        Added: ${ou.created_at}`);

      // Check if it's the wrong org
      if (org.name === 'Hwood Group') {
        console.log('        ⚠️  This is the EMPTY org - needs to be moved to "The h.wood Group"');
      } else if (org.name === 'The h.wood Group') {
        console.log('        ✅ Correct org - has all the data');
      }
    });
  }

  console.log('\n✨ Done');
}

checkJacobOrg().catch(console.error);
