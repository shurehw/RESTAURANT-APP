import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAdamOlson() {
  console.log('🔍 Checking Adam Olson organization membership\n');

  const adamId = '92c09b16-71dd-4231-8743-a7d66fd0d03c';

  // Check org membership
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      is_active,
      created_at,
      organizations(name)
    `)
    .eq('user_id', adamId);

  console.log('📧 Adam Olson (aolson@hwoodgroup.com)');
  console.log(`   ID: ${adamId}`);

  if (!orgUsers || orgUsers.length === 0) {
    console.log(`   ⚠️  NOT IN ANY ORGANIZATION!\n`);

    // Check Hwood Group org
    const { data: hwoodOrg } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('name', 'Hwood Group')
      .single();

    if (hwoodOrg) {
      console.log(`✨ Hwood Group org exists: ${hwoodOrg.id}`);
      console.log(`\nTo fix, run:`);
      console.log(`INSERT INTO organization_users (user_id, organization_id, role, is_active)`);
      console.log(`VALUES ('${adamId}', '${hwoodOrg.id}', 'admin', true);`);
    }
  } else {
    console.log(`   ✅ Organizations:`);
    orgUsers.forEach(ou => {
      console.log(`     - ${(ou.organizations as any)?.name} (${ou.role}, ${ou.is_active ? 'Active' : 'Inactive'})`);
      console.log(`       Added: ${ou.created_at}`);
    });
  }

  console.log('\n✨ Done');
}

checkAdamOlson().catch(console.error);
