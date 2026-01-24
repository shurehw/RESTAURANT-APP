import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAuthUserForAdam() {
  console.log('🔍 Creating auth user for Adam (aolson@hwoodgroup.com)...\n');

  // First, get Adam from custom users table
  const { data: adamCustom, error: customError } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'aolson@hwoodgroup.com')
    .single();

  if (customError || !adamCustom) {
    console.error('❌ Adam not found in custom users table:', customError);
    return;
  }

  console.log(`Found Adam in custom users: ${adamCustom.email} (${adamCustom.id})`);
  console.log(`Full name: ${adamCustom.full_name || 'Not set'}`);

  // Check if auth user already exists
  const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
  const existingAuth = existingAuthUsers?.users.find(u => u.email?.toLowerCase() === 'aolson@hwoodgroup.com');

  if (existingAuth) {
    console.log(`\n✅ Auth user already exists: ${existingAuth.email} (${existingAuth.id})`);
    console.log('Linking to organization...\n');
    
    // Get h.wood group organization
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .or('slug.eq.hwood-group,name.eq.The h.wood Group,name.eq.Hwood Group')
      .single();

    if (!org) {
      console.error('❌ h.wood group organization not found');
      return;
    }

    console.log(`Organization: ${org.name} (${org.id})`);

    // Link to organization
    const { error: linkError } = await supabase
      .from('organization_users')
      .upsert({
        user_id: existingAuth.id,
        organization_id: org.id,
        role: 'viewer',
        is_active: true,
      }, {
        onConflict: 'organization_id,user_id'
      });

    if (linkError) {
      console.error('❌ Error linking to organization:', linkError);
    } else {
      console.log('✅ Successfully linked Adam to h.wood group organization!');
    }
    return;
  }

  // Create auth user - we need a temporary password
  // Note: We can't get the original password, so we'll need to set a new one
  // The user will need to reset their password
  const tempPassword = `TempPass${Math.random().toString(36).slice(-8)}!`;
  
  console.log('\n⚠️  Creating new auth user...');
  console.log('   Note: Adam will need to reset his password after this.');
  console.log(`   Temporary password: ${tempPassword}\n`);

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: 'aolson@hwoodgroup.com',
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: adamCustom.full_name || 'Adam Olson',
    },
  });

  if (authError) {
    console.error('❌ Error creating auth user:', authError);
    return;
  }

  console.log(`✅ Created auth user: ${authUser.user.email} (${authUser.user.id})`);

  // Get h.wood group organization
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .or('slug.eq.hwood-group,name.eq.The h.wood Group,name.eq.Hwood Group')
    .single();

  if (!org) {
    console.error('❌ h.wood group organization not found');
    return;
  }

  console.log(`\nOrganization: ${org.name} (${org.id})`);

  // Link to organization
  const { error: linkError } = await supabase
    .from('organization_users')
    .insert({
      user_id: authUser.user.id,
      organization_id: org.id,
      role: 'viewer',
      is_active: true,
    });

  if (linkError) {
    console.error('❌ Error linking to organization:', linkError);
  } else {
    console.log('✅ Successfully linked Adam to h.wood group organization!');
    console.log('\n⚠️  IMPORTANT: Adam needs to reset his password.');
    console.log('   He can use the "Forgot Password" feature or you can reset it via Supabase Admin.');
  }
}

createAuthUserForAdam().catch(console.error);
