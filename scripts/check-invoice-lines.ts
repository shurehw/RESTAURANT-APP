import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkLines() {
  const supabase = createAdminClient();

  // Count total invoice_lines
  const { count: totalCount } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Total invoice_lines in database: ${totalCount}\n`);

  // Get Dallas invoice IDs
  const { data: dallasInvoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c');

  const invoiceIds = dallasInvoices?.map(i => i.id) || [];

  // Count lines for Dallas invoices
  const { count: dallasLineCount } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true })
    .in('invoice_id', invoiceIds);

  console.log(`📍 Delilah Dallas invoice_lines: ${dallasLineCount}`);
  
  // Get sample lines
  const { data: sampleLines } = await supabase
    .from('invoice_lines')
    .select('*')
    .in('invoice_id', invoiceIds)
    .limit(5);

  console.log('\n📄 Sample lines:');
  sampleLines?.forEach(line => {
    console.log(`  ${line.description} - Qty: ${line.quantity} - $${line.unit_cost} = $${line.line_total}`);
  });
}

checkLines()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
