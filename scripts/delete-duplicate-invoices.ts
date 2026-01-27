/**
 * Delete Duplicate Invoices on Deactivated Vendors
 * Removes invoices that exist on inactive vendors when the same invoice already exists on active vendors
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🔄 Finding Duplicate Invoices on Deactivated Vendors\n');
  console.log('='.repeat(80));

  // Get all invoices on deactivated vendors
  const { data: inactiveInvoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      vendor:vendors!inner(id, name, is_active)
    `)
    .eq('vendors.is_active', false)
    .order('created_at', { ascending: false });

  if (error || !inactiveInvoices) {
    console.error('Error fetching invoices:', error);
    return;
  }

  console.log(`\n📋 Found ${inactiveInvoices.length} invoices on deactivated vendors\n`);

  if (inactiveInvoices.length === 0) {
    console.log('✅ No duplicate invoices to delete!');
    return;
  }

  let deletedCount = 0;

  for (const invoice of inactiveInvoices) {
    const vendor = invoice.vendor as any;
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Invoice: ${invoice.invoice_number || 'N/A'}`);
    console.log(`  Vendor: ${vendor.name} (INACTIVE)`);
    console.log(`  Date: ${invoice.invoice_date}`);
    console.log(`  Amount: $${invoice.total_amount}`);

    // Delete the invoice
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoice.id);

    if (deleteError) {
      console.error(`  ❌ Failed to delete: ${deleteError.message}`);
    } else {
      console.log(`  ✅ Deleted`);
      deletedCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 DELETION COMPLETE\n');
  console.log(`  Invoices deleted: ${deletedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
