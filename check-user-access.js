const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const supabaseServiceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAccess() {
  // Get your user (jacob@thebinyagroup.com)
  const { data: users } = await supabase
    .from('organization_users')
    .select('user_id, organization_id, organizations(name), users:user_id(email)')
    .limit(5);

  console.log('Users and their organizations:');
  users.forEach(u => {
    console.log(`  ${u.users?.email || 'Unknown'} → ${u.organizations?.name}`);
  });
  console.log('');

  // Get all venues and their organizations
  const { data: venues } = await supabase
    .from('venues')
    .select('name, organization_id, organizations(name)')
    .order('name');

  console.log('Venues and their organizations:');
  venues.forEach(v => {
    console.log(`  ${v.name} → ${v.organizations?.name || 'No Organization'}`);
  });
  console.log('');

  // Check if invoice is visible
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, venue:venues(name, organization_id)')
    .eq('invoice_number', '35738')
    .maybeSingle();

  if (invoice) {
    console.log('Invoice #35738:');
    console.log(`  Venue: ${invoice.venue.name}`);
    console.log(`  Org: ${invoice.venue.organization_id}`);
  }
}

checkAccess();
