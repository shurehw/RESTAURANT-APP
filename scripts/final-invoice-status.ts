import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getFinalStatus() {
  const supabase = createAdminClient();

  // Get all Dallas invoices
  const { data: allInvoices, error } = await supabase
    .from('invoices')
    .select('id, vendor_name, invoice_number, invoice_date, total_amount, line_item_count')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c')
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const total = allInvoices.length;
  const complete = allInvoices.filter(inv => inv.line_item_count && inv.line_item_count > 0).length;
  const noLines = allInvoices.filter(inv => !inv.line_item_count || inv.line_item_count === 0).length;

  // Calculate total line items
  const totalLineItems = allInvoices.reduce((sum, inv) => sum + (inv.line_item_count || 0), 0);

  console.log('\n📊 DELILAH DALLAS INVOICE STATUS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Invoices: ${total}`);
  console.log(`✅ Complete (with line items): ${complete} (${Math.round(complete/total*100)}%)`);
  console.log(`❌ Missing line items: ${noLines} (${Math.round(noLines/total*100)}%)`);
  console.log(`📝 Total Line Items: ${totalLineItems}`);
  console.log('');

  // Vendor breakdown
  const vendorStats = allInvoices.reduce((acc, inv) => {
    const vendor = inv.vendor_name || 'UNKNOWN';
    if (!acc[vendor]) {
      acc[vendor] = { total: 0, complete: 0, noLines: 0, lineItems: 0 };
    }
    acc[vendor].total++;
    acc[vendor].lineItems += inv.line_item_count || 0;
    if (inv.line_item_count && inv.line_item_count > 0) {
      acc[vendor].complete++;
    } else {
      acc[vendor].noLines++;
    }
    return acc;
  }, {} as Record<string, { total: number; complete: number; noLines: number; lineItems: number; }>);

  console.log('📦 BY VENDOR:');
  console.log('═══════════════════════════════════════════════════════════');
  Object.entries(vendorStats)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([vendor, stats]) => {
      const pct = Math.round(stats.complete / stats.total * 100);
      console.log(`${vendor}:`);
      console.log(`  Total: ${stats.total} | Complete: ${stats.complete} (${pct}%) | Missing: ${stats.noLines} | Line Items: ${stats.lineItems}`);
    });

  console.log('\n📅 RECENT INVOICES:');
  console.log('═══════════════════════════════════════════════════════════');
  allInvoices.slice(0, 10).forEach(inv => {
    const status = (inv.line_item_count || 0) > 0 ? '✅' : '❌';
    console.log(`${status} ${inv.invoice_date} - ${inv.vendor_name} #${inv.invoice_number} - $${inv.total_amount?.toFixed(2)} (${inv.line_item_count || 0} lines)`);
  });
}

getFinalStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
