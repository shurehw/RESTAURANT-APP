import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkInvoice() {
  const supabase = createAdminClient();
  const invoiceId = 'ecfec8aa-da70-41c1-8bd2-395e314b42df';

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, ocr_raw_json, vendors!inner(name)')
    .eq('id', invoiceId)
    .single();

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('id, description, qty, unit_cost, line_total')
    .eq('invoice_id', invoiceId);

  console.log('\n📋 Invoice #2108713 Details:\n');
  console.log('Vendor:', (invoice?.vendors as any)?.name);
  console.log('Date:', invoice?.invoice_date);
  console.log('Total:', invoice?.total_amount);
  console.log('Has OCR data:', invoice?.ocr_raw_json ? 'Yes' : 'No');
  console.log('Line items:', lines?.length || 0);

  if (lines && lines.length > 0) {
    console.log('\nLine items:');
    const lineTotal = lines.reduce((sum, line) => sum + (line.line_total || 0), 0);
    lines.forEach((line, idx) => {
      console.log(`  ${idx + 1}. ${line.description}`);
      console.log(`     ${line.qty} x $${line.unit_cost} = $${line.line_total}`);
    });
    console.log(`\nLine items total: $${lineTotal.toFixed(2)}`);
    console.log(`Invoice total: $${invoice?.total_amount}`);
    console.log(`Match: ${Math.abs(lineTotal - (invoice?.total_amount || 0)) < 0.01 ? 'Yes ✓' : 'No ⚠'}`);
  } else {
    console.log('\n⚠️  No line items found!');
  }
}

checkInvoice()
  .then(() => process.exit(0))
  .catch(console.error);
