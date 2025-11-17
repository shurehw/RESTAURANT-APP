/**
 * Check what invoices are returned for jacob@hwoodgroup.com
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MzkxNzQsImV4cCI6MjA3ODIxNTE3NH0.c2r4D_kMbr-J6XHkgwCQTNDrh3n4Fn9OYn8QqOHmKRA';

async function checkInvoices() {
  console.log('🔍 Checking invoices as jacob@hwoodgroup.com\n');

  // Sign in as the user
  const supabase = createClient(supabaseUrl, anonKey);

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'jacob@hwoodgroup.com',
    password: 'password123'  // You'll need to provide the actual password
  });

  if (signInError) {
    console.log('❌ Sign in failed:', signInError.message);
    console.log('Note: Using service key to check invoices instead...\n');

    // Fall back to service key
    const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ucmFlZXNzY3FzYWFwcGthbGRiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjYzOTE3NCwiZXhwIjoyMDc4MjE1MTc0fQ.N4erm4GjP1AV8uDP2OVPBIdZnNtuofPmyLFdM2IVhXI';
    const adminSupabase = createClient(supabaseUrl, serviceKey);

    // Get user ID first
    const { data: users } = await adminSupabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email === 'jacob@hwoodgroup.com');

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    // Get accessible venue IDs
    const { data: orgUsers } = await adminSupabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id);

    const orgIds = orgUsers?.map(ou => ou.organization_id) || [];

    const { data: venues } = await adminSupabase
      .from('venues')
      .select('id, name')
      .in('organization_id', orgIds);

    const venueIds = venues?.map(v => v.id) || [];

    console.log('Accessible venues:');
    venues?.forEach(v => console.log(`  - ${v.name} (${v.id})`));
    console.log('');

    // Query invoices (what RLS would return)
    const { data: invoices } = await adminSupabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        total_amount,
        status,
        vendor:vendors(name),
        venue:venues(name)
      `)
      .in('venue_id', venueIds)
      .order('invoice_date', { ascending: false })
      .limit(50);

    console.log(`📄 Invoices (${invoices?.length || 0} total):`);
    invoices?.forEach(inv => {
      console.log(`  ${inv.invoice_number || 'No #'} | ${inv.vendor?.name || 'Unknown'} | ${inv.venue?.name || '?'} | $${inv.total_amount || 0} | ${inv.status}`);
    });

    return;
  }

  // User signed in successfully - run the actual query
  console.log(`✅ Signed in as ${signInData.user.email}\n`);

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      status,
      ocr_confidence,
      match_confidence,
      auto_approved,
      total_variance_pct,
      variance_severity,
      purchase_order_id,
      vendor:vendors!inner(name),
      venue:venues!inner(name),
      purchase_orders:purchase_order_id(order_number)
    `)
    .order('invoice_date', { ascending: false })
    .limit(50);

  if (error) {
    console.log('❌ Query failed:', error.message);
    return;
  }

  console.log(`📄 Invoices returned (${invoices.length} total):\n`);

  invoices.forEach((inv, idx) => {
    console.log(`${idx + 1}. Invoice #${inv.invoice_number || 'No #'}`);
    console.log(`   Vendor: ${inv.vendor?.name || 'Unknown'}`);
    console.log(`   Venue: ${inv.venue?.name || '?'}`);
    console.log(`   Amount: $${inv.total_amount?.toFixed(2) || '0.00'}`);
    console.log(`   Date: ${inv.invoice_date}`);
    console.log(`   Status: ${inv.status}`);
    console.log('');
  });

  // Check if our specific invoice is in there
  const ourInvoice = invoices.find(inv => inv.invoice_number === '35738');
  if (ourInvoice) {
    console.log('✅ Invoice #35738 IS in the results!');
  } else {
    console.log('❌ Invoice #35738 NOT in the results');
  }
}

checkInvoices().catch(console.error);
