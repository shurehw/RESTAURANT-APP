import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addJacobToHwood() {
  console.log('🔍 Adding jacob@hwoodgroup.com to Hwood Group...\n');

  // Get jacob's user ID
  const { data: users } = await supabase.auth.admin.listUsers();
  const jacob = users?.users.find(u => u.email === 'jacob@hwoodgroup.com');

  if (!jacob) {
    console.error('❌ jacob@hwoodgroup.com not found');
    return;
  }

  console.log(`User: ${jacob.email} (${jacob.id})`);

  // Get Hwood Group org ID
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', 'hwood-group')
    .single();

  if (!org) {
    console.error('❌ Hwood Group organization not found');
    return;
  }

  console.log(`Organization: ${org.name} (${org.id})\n`);

  // Check if already a member
  const { data: existing } = await supabase
    .from('organization_users')
    .select('*')
    .eq('user_id', jacob.id)
    .eq('organization_id', org.id)
    .single();

  if (existing) {
    console.log('⚠️  jacob is already a member of Hwood Group');
    console.log(`   Active: ${existing.is_active}`);

    if (!existing.is_active) {
      const { error } = await supabase
        .from('organization_users')
        .update({ is_active: true })
        .eq('user_id', jacob.id)
        .eq('organization_id', org.id);

      if (error) {
        console.error('❌ Error activating membership:', error);
      } else {
        console.log('✅ Activated jacob\'s membership in Hwood Group');
      }
    }
  } else {
    // Add jacob to Hwood Group
    const { error } = await supabase
      .from('organization_users')
      .insert({
        user_id: jacob.id,
        organization_id: org.id,
        role: 'admin',
        is_active: true
      });

    if (error) {
      console.error('❌ Error adding jacob to Hwood Group:', error);
    } else {
      console.log('✅ Successfully added jacob to Hwood Group organization');
    }
  }

  console.log('\n✅ Complete!');
}

addJacobToHwood();
