/**
 * Delete test invoice #70238322 and its vendor
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteTestInvoice() {
  console.log('🗑️  Deleting test invoice #70238322...\n');

  // Find the invoice
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_id, total_amount, invoice_date, vendors(id, name)')
    .eq('invoice_number', '70238322')
    .single();

  if (!invoice) {
    console.log('✅ Invoice not found (already deleted)');
    return;
  }

  console.log(`Found invoice:`);
  console.log(`  #${invoice.invoice_number}`);
  console.log(`  Date: ${invoice.invoice_date}`);
  console.log(`  Amount: $${invoice.total_amount}`);
  console.log(`  Vendor: ${(invoice.vendors as any)?.name}`);
  console.log();

  // Delete invoice lines
  console.log('Deleting invoice lines...');
  await supabase
    .from('invoice_lines')
    .delete()
    .eq('invoice_id', invoice.id);

  // Delete invoice
  console.log('Deleting invoice...');
  await supabase
    .from('invoices')
    .delete()
    .eq('id', invoice.id);

  console.log('✅ Deleted invoice\n');

  // Check if vendor has any other invoices
  if (invoice.vendor_id) {
    const { count } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('vendor_id', invoice.vendor_id);

    if (count === 0) {
      const vendorName = (invoice.vendors as any)?.name;
      console.log(`Vendor "${vendorName}" has no remaining invoices`);
      console.log('Deleting vendor...');

      await supabase
        .from('vendors')
        .delete()
        .eq('id', invoice.vendor_id);

      console.log(`✅ Deleted vendor "${vendorName}"\n`);
    } else {
      console.log(`Vendor has ${count} remaining invoice(s), keeping vendor\n`);
    }
  }

  console.log('✨ Cleanup complete!\n');
}

deleteTestInvoice().catch(console.error);
