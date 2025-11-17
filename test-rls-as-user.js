/**
 * Test RLS as the actual authenticated user
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzkxNzQsImV4cCI6MjA3ODIxNTE3NH0.QaPiMs48H9nsH7wGNhi_1jYRQ_YAPGLduxSpYOrz1ug';
const serviceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

async function testRLS() {
  // Create authenticated client
  const supabase = createClient(supabaseUrl, anonKey);

  // Sign in as jacob
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'jacob@hwoodgroup.com',
    password: 'password123'
  });

  if (signInError) {
    console.log('❌ Sign in failed:', signInError.message);
    return;
  }

  console.log('✅ Signed in as', signInData.user.email);
  console.log('User ID:', signInData.user.id);
  console.log('');

  // Test current_user_venue_ids view
  console.log('Testing current_user_venue_ids view...');
  const { data: venueIds, error: venueIdsError } = await supabase
    .from('current_user_venue_ids')
    .select('venue_id');

  if (venueIdsError) {
    console.log('❌ Error querying current_user_venue_ids:', venueIdsError.message);
  } else {
    console.log(`Found ${venueIds?.length || 0} venue IDs:`);
    venueIds?.forEach(v => console.log(`  - ${v.venue_id}`));
  }
  console.log('');

  // Query invoices with RLS
  console.log('Querying invoices with RLS...');
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      vendor:vendors!inner(name),
      venue:venues!inner(name)
    `)
    .order('invoice_date', { ascending: false })
    .limit(50);

  if (invError) {
    console.log('❌ Error:', invError.message);
  } else {
    console.log(`✅ Found ${invoices?.length || 0} invoices`);
    invoices?.forEach(inv => {
      console.log(`  - #${inv.invoice_number}: ${inv.vendor?.name} at ${inv.venue?.name}`);
    });
  }

  // Compare with service role (no RLS)
  console.log('\n---\n');
  console.log('Querying with service role (no RLS)...');
  const adminSupabase = createClient(supabaseUrl, serviceKey);
  const { data: adminInvoices } = await adminSupabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      venue_id,
      vendor:vendors(name),
      venue:venues(name)
    `)
    .in('venue_id', venueIds?.map(v => v.venue_id) || []);

  console.log(`Found ${adminInvoices?.length || 0} invoices (service role, filtered by venue IDs)`);
  adminInvoices?.forEach(inv => {
    console.log(`  - #${inv.invoice_number}: ${inv.vendor?.name} at ${inv.venue?.name} (venue_id: ${inv.venue_id})`);
  });
}

testRLS().catch(console.error);
