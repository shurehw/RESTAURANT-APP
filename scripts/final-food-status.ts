import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getFinalStatus() {
  const supabase = createAdminClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_name, total_amount, created_at')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c')
    .order('created_at', { ascending: false });

  if (!invoices) return;

  // Get line counts for each invoice
  const invoiceIds = invoices.map(i => i.id);
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, id')
    .in('invoice_id', invoiceIds);

  const lineCounts = lines?.reduce((acc, line) => {
    acc[line.invoice_id] = (acc[line.invoice_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const withLines = invoices.filter(i => lineCounts[i.id] > 0);
  const noLines = invoices.filter(i => !lineCounts[i.id]);
  const totalLines = Object.values(lineCounts).reduce((sum, count) => sum + count, 0);

  console.log('\n📊 DELILAH DALLAS - FOOD INVOICE STATUS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Invoices: ${invoices.length}`);
  console.log(`✅ With lines: ${withLines.length} (${Math.round(withLines.length/invoices.length*100)}%)`);
  console.log(`❌ Missing lines: ${noLines.length} (${Math.round(noLines.length/invoices.length*100)}%)`);
  console.log(`📝 Total Line Items: ${totalLines}`);
  console.log('');

  // Vendor breakdown
  const vendorStats = invoices.reduce((acc, inv) => {
    const vendor = inv.vendor_name || 'UNKNOWN';
    if (!acc[vendor]) {
      acc[vendor] = { total: 0, withLines: 0, lines: 0 };
    }
    acc[vendor].total++;
    if (lineCounts[inv.id]) {
      acc[vendor].withLines++;
      acc[vendor].lines += lineCounts[inv.id];
    }
    return acc;
  }, {} as Record<string, any>);

  console.log('📦 BY VENDOR (top 15):');
  console.log('─────────────────────────────────────────────────────────');
  Object.entries(vendorStats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15)
    .forEach(([vendor, stats]) => {
      const pct = Math.round(stats.withLines / stats.total * 100);
      console.log(`${vendor}:`);
      console.log(`  ${stats.withLines}/${stats.total} complete (${pct}%) | ${stats.lines} lines`);
    });

  console.log('\n❌ INVOICES MISSING LINES (first 10):');
  console.log('─────────────────────────────────────────────────────────');
  noLines.slice(0, 10).forEach(inv => {
    console.log(`  ${inv.vendor_name} #${inv.invoice_number} - $${inv.total_amount}`);
  });
}

getFinalStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
