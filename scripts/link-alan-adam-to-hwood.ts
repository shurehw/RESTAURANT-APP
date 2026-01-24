import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function linkUsersToHwood() {
  console.log('🔍 Linking Alan and Adam to Hwood Group...\n');

  // Get all auth users
  const { data: users } = await supabase.auth.admin.listUsers();
  
  if (!users || !users.users) {
    console.error('❌ No users found');
    return;
  }

  // Find Alan and Adam
  const alan = users.users.find(u => 
    u.email?.toLowerCase().includes('alan') && u.email?.toLowerCase().endsWith('@hwoodgroup.com')
  );
  const adam = users.users.find(u => 
    u.email?.toLowerCase().includes('adam') && u.email?.toLowerCase().endsWith('@hwoodgroup.com')
  );

  // Get Hwood Group org ID (try by slug first, then by name)
  let { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', 'hwood-group')
    .single();

  if (!org) {
    const { data: orgByName } = await supabase
      .from('organizations')
      .select('id, name')
      .or('name.eq.The h.wood Group,name.eq.Hwood Group')
      .single();
    org = orgByName || null;
  }

  if (!org) {
    console.error('❌ Hwood Group organization not found');
    return;
  }

  console.log(`Organization: ${org.name} (${org.id})\n`);

  // Function to link a user
  const linkUser = async (user: any, name: string) => {
    if (!user) {
      console.log(`⚠️  ${name} not found in auth.users`);
      return;
    }

    console.log(`User: ${user.email} (${user.id})`);

    // Check if already a member
    const { data: existing } = await supabase
      .from('organization_users')
      .select('*')
      .eq('user_id', user.id)
      .eq('organization_id', org.id)
      .single();

    if (existing) {
      console.log(`⚠️  ${name} is already a member of Hwood Group`);
      console.log(`   Active: ${existing.is_active}, Role: ${existing.role}`);

      if (!existing.is_active) {
        const { error } = await supabase
          .from('organization_users')
          .update({ is_active: true })
          .eq('user_id', user.id)
          .eq('organization_id', org.id);

        if (error) {
          console.error(`❌ Error activating ${name}'s membership:`, error);
        } else {
          console.log(`✅ Activated ${name}'s membership in Hwood Group`);
        }
      }
    } else {
      // Add user to Hwood Group
      const { error } = await supabase
        .from('organization_users')
        .insert({
          user_id: user.id,
          organization_id: org.id,
          role: 'viewer',
          is_active: true
        });

      if (error) {
        console.error(`❌ Error adding ${name} to Hwood Group:`, error);
      } else {
        console.log(`✅ Successfully added ${name} to Hwood Group organization`);
      }
    }
    console.log('');
  };

  // Link both users
  await linkUser(alan, 'Alan');
  await linkUser(adam, 'Adam');

  console.log('✅ Complete!');
}

linkUsersToHwood().catch(console.error);
