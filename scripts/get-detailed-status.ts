import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getDetailedStatus() {
  const supabase = createAdminClient();

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, status')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c')
    .order('created_at', { ascending: false });

  if (!invoices) {
    console.log('No invoices found');
    return;
  }

  // Get line item counts
  const invoiceIds = invoices.map(i => i.id);
  const { data: lineItemData } = await supabase
    .from('invoice_line_items')
    .select('invoice_id, id');

  const lineItemCounts = lineItemData?.reduce((acc, item) => {
    acc[item.invoice_id] = (acc[item.invoice_id] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const withLines = invoices.filter(inv => lineItemCounts[inv.id] > 0);
  const noLines = invoices.filter(inv => !lineItemCounts[inv.id]);

  const totalLineItems = Object.values(lineItemCounts).reduce((sum, count) => sum + count, 0);

  console.log('\n📊 DELILAH DALLAS - DETAILED STATUS');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total Invoices: ${invoices.length}`);
  console.log(`✅ With line items: ${withLines.length} (${Math.round(withLines.length/invoices.length*100)}%)`);
  console.log(`❌ Missing line items: ${noLines.length} (${Math.round(noLines.length/invoices.length*100)}%)`);
  console.log(`📝 Total Line Items: ${totalLineItems}`);
  console.log('');

  console.log('✅ COMPLETE INVOICES (recent 10):');
  console.log('─────────────────────────────────────────────────────────');
  withLines.slice(0, 10).forEach(inv => {
    console.log(`  #${inv.invoice_number} - $${inv.total_amount?.toFixed(2)} (${lineItemCounts[inv.id]} lines)`);
  });

  console.log('\n❌ MISSING LINE ITEMS (recent 10):');
  console.log('─────────────────────────────────────────────────────────');
  noLines.slice(0, 10).forEach(inv => {
    console.log(`  #${inv.invoice_number} - $${inv.total_amount?.toFixed(2)}`);
  });
}

getDetailedStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
