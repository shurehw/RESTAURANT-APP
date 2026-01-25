import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixAdamOrg() {
  console.log('🔧 Moving Adam Olson to correct organization\n');

  const adamId = '92c09b16-71dd-4231-8743-a7d66fd0d03c';
  const wrongOrgId = 'f94d6149-f107-4498-937f-47fe81377dba'; // Hwood Group (empty)
  const correctOrgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41'; // The h.wood Group (has data)

  // Delete from wrong org
  console.log('Removing from "Hwood Group" (empty org)...');
  const { error: deleteError } = await supabase
    .from('organization_users')
    .delete()
    .eq('user_id', adamId)
    .eq('organization_id', wrongOrgId);

  if (deleteError) {
    console.error('❌ Error deleting:', deleteError);
  } else {
    console.log('✅ Removed from wrong org');
  }

  // Add to correct org
  console.log('\nAdding to "The h.wood Group" (has 4 venues, 326 GL accounts, 1784 items)...');
  const { error: insertError } = await supabase
    .from('organization_users')
    .upsert({
      user_id: adamId,
      organization_id: correctOrgId,
      role: 'admin',
      is_active: true,
    }, {
      onConflict: 'user_id,organization_id'
    });

  if (insertError) {
    console.error('❌ Error inserting:', insertError);
  } else {
    console.log('✅ Added to correct org');
  }

  // Verify
  console.log('\nVerifying...');
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select(`
      organization_id,
      role,
      is_active,
      organizations(name)
    `)
    .eq('user_id', adamId);

  if (orgUsers) {
    console.log('\nAdam is now in:');
    orgUsers.forEach(ou => {
      console.log(`   - ${(ou.organizations as any)?.name} (${ou.role})`);
    });
  }

  console.log('\n✅ Done! Adam should now have access to all data.');
}

fixAdamOrg().catch(console.error);
