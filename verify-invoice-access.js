/**
 * Verify invoice access for user jacob@hwoodgroup.com
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const serviceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

const supabase = createClient(supabaseUrl, serviceKey);

async function verify() {
  console.log('🔍 Verifying invoice access for jacob@hwoodgroup.com\n');

  // 1. Get user info
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find(u => u.email === 'jacob@hwoodgroup.com');

  if (!user) {
    console.log('❌ User jacob@hwoodgroup.com not found');
    return;
  }

  console.log(`✅ User found: ${user.id}`);
  console.log(`   Email: ${user.email}\n`);

  // 2. Check organization membership
  const { data: orgMemberships } = await supabase
    .from('organization_users')
    .select('organization_id, role, is_active, organizations(name)')
    .eq('user_id', user.id);

  console.log('📋 Organization memberships:');
  orgMemberships?.forEach(om => {
    console.log(`   - ${om.organizations.name} (${om.role}) - ${om.is_active ? 'ACTIVE' : 'INACTIVE'}`);
  });
  console.log('');

  // 3. Check venues accessible via current_user_venue_ids logic
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, organization_id, organizations(name)')
    .in('organization_id', orgMemberships?.map(om => om.organization_id) || []);

  console.log('🏢 Accessible venues:');
  venues?.forEach(v => {
    console.log(`   - ${v.name} (${v.id})`);
    console.log(`     Org: ${v.organizations.name}`);
  });
  console.log('');

  // 4. Find Delilah Miami
  const delilahMiami = venues?.find(v => v.name === 'Delilah Miami');
  if (!delilahMiami) {
    console.log('❌ Delilah Miami not in accessible venues list');
    return;
  }

  console.log(`✅ Delilah Miami is accessible (${delilahMiami.id})\n`);

  // 5. Check invoice
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, venue_id, vendor_id, total_amount, status, venues(name)')
    .eq('invoice_number', '35738')
    .maybeSingle();

  if (!invoice) {
    console.log('❌ Invoice #35738 not found');
    return;
  }

  console.log('📄 Invoice #35738:');
  console.log(`   ID: ${invoice.id}`);
  console.log(`   Venue: ${invoice.venues.name} (${invoice.venue_id})`);
  console.log(`   Vendor ID: ${invoice.vendor_id}`);
  console.log(`   Amount: $${invoice.total_amount}`);
  console.log(`   Status: ${invoice.status}\n`);

  // 6. Verify venue_id matches
  if (invoice.venue_id === delilahMiami.id) {
    console.log('✅ Invoice venue_id matches Delilah Miami');
    console.log('✅ User SHOULD be able to see this invoice');
  } else {
    console.log('❌ Invoice venue_id does NOT match Delilah Miami');
    console.log(`   Expected: ${delilahMiami.id}`);
    console.log(`   Got: ${invoice.venue_id}`);
  }
}

verify().catch(console.error);
