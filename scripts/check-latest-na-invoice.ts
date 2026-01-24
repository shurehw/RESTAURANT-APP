import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkInvoice() {
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      vendor:vendors(name),
      venue:venues(name),
      lines:invoice_lines(*)
    `)
    .eq('invoice_number', '16925255')
    .single();

  if (!invoice) {
    console.log('❌ Invoice not found');
    return;
  }

  console.log('\n📄 Invoice Details:');
  console.log(`  Vendor: ${invoice.vendor?.name}`);
  console.log(`  Invoice #: ${invoice.invoice_number}`);
  console.log(`  Date: ${invoice.invoice_date}`);
  console.log(`  Total: $${invoice.total_amount}`);
  console.log(`  Status: ${invoice.status}`);

  console.log('\n📦 Line Items:');
  invoice.lines?.forEach((line: any, i: number) => {
    console.log(`  ${i + 1}. ${line.description}`);
    console.log(`     Qty: ${line.qty}, Unit Cost: $${line.unit_cost}, Total: $${line.line_total}`);
    console.log(`     Item ID: ${line.item_id || 'NOT MAPPED'}`);
    console.log(`     Confirmed: ${line.match_confirmed ? 'Yes' : 'No'}`);
  });
}

checkInvoice();
