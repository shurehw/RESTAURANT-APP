import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkStatus() {
  // Get invoices from today
  const { data: invoices, count } = await supabase
    .from('invoices')
    .select('id, vendor_name, invoice_number, total_amount, created_at', { count: 'exact' })
    .gte('created_at', '2026-01-24')
    .order('created_at', { ascending: false });

  console.log(`📊 IMPORT STATUS`);
  console.log('═'.repeat(70));
  console.log(`Total invoices imported today: ${count}`);

  if (invoices && invoices.length > 0) {
    // Get line items count
    const invoiceIds = invoices.map(inv => inv.id);
    const { count: linesCount } = await supabase
      .from('invoice_lines')
      .select('*', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds);

    console.log(`Total line items: ${linesCount}\n`);
    console.log(`Latest 10 invoices:`);
    invoices.slice(0, 10).forEach((inv, i) => {
      console.log(`${i + 1}. ${inv.vendor_name} - ${inv.invoice_number || 'N/A'} ($${inv.total_amount})`);
    });
  }
}

checkStatus();
