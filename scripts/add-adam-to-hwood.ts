import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addAdamToHwood() {
  console.log('🔧 Adding Adam Olson to Hwood Group\n');

  const adamId = '92c09b16-71dd-4231-8743-a7d66fd0d03c';
  const hwoodOrgId = 'f94d6149-f107-4498-937f-47fe81377dba';

  const { data, error } = await supabase
    .from('organization_users')
    .insert({
      user_id: adamId,
      organization_id: hwoodOrgId,
      role: 'admin',
      is_active: true,
    })
    .select();

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log('✅ Adam Olson added to Hwood Group as admin');
  console.log('   User: aolson@hwoodgroup.com');
  console.log('   Organization: Hwood Group');
  console.log('   Role: admin');
  console.log('\n✨ Done! Adam should now have access.');
}

addAdamToHwood().catch(console.error);
