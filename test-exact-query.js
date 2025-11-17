/**
 * Test the EXACT query used by the invoices page
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mnraeesscqsaappkaldb.supabase.co';
const serviceKey = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

const supabase = createClient(supabaseUrl, serviceKey);

async function testQuery() {
  console.log('🔍 Testing EXACT query from invoices page\n');

  // First, set up RLS context for the user
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find(u => u.email === 'jacob@hwoodgroup.com');

  // Get accessible venue IDs
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = orgUsers?.map(ou => ou.organization_id) || [];

  const { data: venues } = await supabase
    .from('venues')
    .select('id')
    .in('organization_id', orgIds);

  const venueIds = venues?.map(v => v.id) || [];

  // Run the EXACT query from the page
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      `
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
    `
    )
    .in('venue_id', venueIds)  // Simulate RLS
    .order("invoice_date", { ascending: false })
    .limit(50);

  if (error) {
    console.log('❌ Query error:', error);
    return;
  }

  console.log(`✅ Query successful! Returned ${invoices.length} invoice(s)\n`);

  if (invoices.length === 0) {
    console.log('⚠️  No invoices returned - this is the problem!');

    // Try without the inner joins
    console.log('\n🔍 Testing query WITHOUT !inner joins...\n');

    const { data: invoices2 } = await supabase
      .from("invoices")
      .select(
        `
        id,
        invoice_number,
        vendor_id,
        venue_id,
        purchase_order_id
      `
      )
      .in('venue_id', venueIds)
      .order("invoice_date", { ascending: false })
      .limit(50);

    console.log(`Found ${invoices2?.length || 0} invoices without joins`);
    invoices2?.forEach(inv => {
      console.log(`  - #${inv.invoice_number}: vendor_id=${inv.vendor_id}, venue_id=${inv.venue_id}, po_id=${inv.purchase_order_id}`);
    });

    return;
  }

  invoices.forEach(inv => {
    console.log(`📄 Invoice #${inv.invoice_number}`);
    console.log(`   Vendor: ${inv.vendor?.name || 'NULL'}`);
    console.log(`   Venue: ${inv.venue?.name || 'NULL'}`);
    console.log(`   PO: ${inv.purchase_orders?.order_number || 'NULL'}`);
    console.log(`   Amount: $${inv.total_amount}`);
    console.log('');
  });
}

testQuery().catch(console.error);
