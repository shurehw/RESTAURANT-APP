import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMbarotAccess() {
  console.log('🔍 Checking mbarot@hwoodgroup.com access...\n');

  // Get mbarot's user record
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();

  const mbarot = users?.users.find(u => u.email === 'mbarot@hwoodgroup.com');

  if (!mbarot) {
    console.error('❌ User mbarot@hwoodgroup.com not found');
    return;
  }

  console.log(`✅ User: ${mbarot.email} (${mbarot.id})\n`);

  // Check organization membership
  const { data: orgUsers, error: orgError } = await supabase
    .from('organization_users')
    .select('organization_id, is_active, organizations(name)')
    .eq('user_id', mbarot.id);

  if (orgError) {
    console.error('❌ Error fetching organization membership:', orgError);
  } else {
    console.log(`📊 Organization Membership (${orgUsers?.length || 0}):`);
    orgUsers?.forEach((ou: any) => {
      console.log(`   - ${ou.organizations?.name || 'Unknown'} (${ou.organization_id}) - Active: ${ou.is_active}`);
    });
  }

  console.log('');

  // Check Rivani Speakeasy project
  const { data: rivani, error: rivaniError } = await supabase
    .from('proforma_projects')
    .select('id, name, org_id, organizations(name)')
    .eq('name', 'Rivani Speakeasy')
    .single();

  if (rivaniError) {
    console.error('❌ Error fetching Rivani Speakeasy:', rivaniError);
  } else {
    console.log(`🏢 Rivani Speakeasy Project:`);
    console.log(`   - Project ID: ${rivani.id}`);
    console.log(`   - Organization: ${(rivani as any).organizations?.name || 'Unknown'} (${rivani.org_id})`);

    // Check if mbarot's org matches
    const mbarotOrg = orgUsers?.find((ou: any) => ou.is_active)?.organization_id;
    if (mbarotOrg === rivani.org_id) {
      console.log(`   ✅ mbarot IS in the same organization - should have access`);
    } else {
      console.log(`   ❌ mbarot IS NOT in the same organization`);
      console.log(`      - mbarot's org: ${mbarotOrg}`);
      console.log(`      - Rivani's org: ${rivani.org_id}`);
    }
  }

  console.log('\n✅ Check complete!');
}

checkMbarotAccess();
