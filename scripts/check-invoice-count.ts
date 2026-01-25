import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkInvoices() {
  const supabase = createAdminClient();

  // Get all venues first
  const { data: allVenues } = await supabase
    .from('venues')
    .select('id, name');

  console.log('\n🏢 All Venues:');
  allVenues?.forEach(v => console.log(`  - ${v.name} (${v.id})`));
  console.log('');

  // Get Delilah Dallas venue
  const venue = allVenues?.find(v => v.name.toLowerCase().includes('delilah') && v.name.toLowerCase().includes('dallas'));

  if (!venue) {
    console.log('❌ Delilah Dallas venue not found');
    return;
  }

  console.log(`\n📍 Using Venue: ${venue.name} (${venue.id})\n`);

  // Get all invoices
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('id, vendor_name, invoice_number, invoice_date, total_amount, status, line_item_count')
    .eq('venue_id', venue.id)
    .order('invoice_date', { ascending: false });

  const total = allInvoices?.length || 0;

  // Get invoices with no line items
  const noLines = allInvoices?.filter(inv => !inv.line_item_count || inv.line_item_count === 0).length || 0;

  // Get complete invoices (>0 line items)
  const complete = allInvoices?.filter(inv => inv.line_item_count && inv.line_item_count > 0).length || 0;

  // Get total line items
  const { count: lineItemCount } = await supabase
    .from('invoice_line_items')
    .select('*', { count: 'exact', head: true })
    .in('invoice_id', allInvoices?.map(i => i.id) || []);

  console.log('📊 INVOICE STATUS SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`Total Invoices: ${total}`);
  console.log(`Complete (with line items): ${complete} (${Math.round(complete/total*100)}%)`);
  console.log(`Missing line items: ${noLines} (${Math.round(noLines/total*100)}%)`);
  console.log(`Total Line Items: ${lineItemCount}`);
  console.log('');

  // Vendor breakdown
  const vendorStats = allInvoices?.reduce((acc, inv) => {
    const vendor = inv.vendor_name || 'UNKNOWN';
    if (!acc[vendor]) {
      acc[vendor] = { total: 0, complete: 0, noLines: 0 };
    }
    acc[vendor].total++;
    if (inv.line_item_count && inv.line_item_count > 0) {
      acc[vendor].complete++;
    } else {
      acc[vendor].noLines++;
    }
    return acc;
  }, {} as Record<string, { total: number; complete: number; noLines: number; }>);

  console.log('📦 BY VENDOR:');
  console.log('════════════════════════════════════════════════════════════════');
  Object.entries(vendorStats || {})
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([vendor, stats]) => {
      const pct = Math.round(stats.complete / stats.total * 100);
      console.log(`${vendor}: ${stats.total} total, ${stats.complete} complete (${pct}%), ${stats.noLines} missing`);
    });
}

checkInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
