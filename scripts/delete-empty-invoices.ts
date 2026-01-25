import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function deleteEmptyInvoices() {
  const supabase = createAdminClient();

  // Get all Dallas invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_name')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c');

  if (!invoices) {
    console.log('No invoices found');
    return;
  }

  console.log(`\nFound ${invoices.length} total invoices`);

  // Get line counts
  const invoiceIds = invoices.map(i => i.id);
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id')
    .in('invoice_id', invoiceIds);

  const invoicesWithLines = new Set(lines?.map(l => l.invoice_id) || []);
  const emptyInvoices = invoices.filter(i => !invoicesWithLines.has(i.id));

  console.log(`\n📊 Status:`);
  console.log(`  With lines: ${invoicesWithLines.size}`);
  console.log(`  Empty: ${emptyInvoices.length}`);

  if (emptyInvoices.length === 0) {
    console.log('\n✅ No empty invoices to delete');
    return;
  }

  console.log(`\n🗑️  Deleting ${emptyInvoices.length} empty invoices...`);

  const emptyIds = emptyInvoices.map(i => i.id);
  
  // Delete in batches of 100
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < emptyIds.length; i += batchSize) {
    const batch = emptyIds.slice(i, i + batchSize);
    const { error } = await supabase
      .from('invoices')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`  ❌ Error deleting batch ${i / batchSize + 1}:`, error);
    } else {
      deleted += batch.length;
      console.log(`  ✅ Deleted batch ${i / batchSize + 1} (${batch.length} invoices) - Total: ${deleted}/${emptyInvoices.length}`);
    }
  }

  console.log(`\n✅ Deleted ${deleted} empty invoices`);
  console.log(`📝 Remaining invoices: ${invoices.length - deleted}`);
}

deleteEmptyInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
