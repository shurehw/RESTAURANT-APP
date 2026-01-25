import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkAllInvoices() {
  const supabase = createAdminClient();

  // Count all invoices in the database
  const { count: totalCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Total invoices in database: ${totalCount}\n`);

  // Get invoices by venue
  const { data: invoicesByVenue } = await supabase
    .from('invoices')
    .select('venue_id, venues(name)');

  const venueBreakdown = invoicesByVenue?.reduce((acc, inv) => {
    const venueName = (inv.venues as any)?.name || 'Unknown';
    acc[venueName] = (acc[venueName] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('By Venue:');
  Object.entries(venueBreakdown || {})
    .sort((a, b) => b[1] - a[1])
    .forEach(([venue, count]) => {
      console.log(`  ${venue}: ${count}`);
    });

  // Get Delilah Dallas invoices specifically
  const { data: dallasInvoices } = await supabase
    .from('invoices')
    .select('id, vendor_name, invoice_number, invoice_date, total_amount, venue_id, venues(name)')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n📍 Recent Delilah Dallas invoices:');
  dallasInvoices?.forEach(inv => {
    console.log(`  ${inv.invoice_date} - ${inv.vendor_name} #${inv.invoice_number} - $${inv.total_amount}`);
  });
}

checkAllInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
