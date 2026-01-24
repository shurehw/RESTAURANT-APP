import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🔍 Finding duplicate invoices...\n');

  // Find all invoices grouped by vendor_id + invoice_number
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('id, vendor_id, invoice_number, created_at, vendors(name)')
    .not('invoice_number', 'is', null)
    .order('created_at', { ascending: true });

  if (!allInvoices || allInvoices.length === 0) {
    console.log('No invoices found');
    return;
  }

  // Group by vendor_id + invoice_number
  const grouped = allInvoices.reduce((acc, inv) => {
    const key = `${inv.vendor_id}-${inv.invoice_number}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(inv);
    return acc;
  }, {} as Record<string, typeof allInvoices>);

  // Find duplicates (more than 1 invoice with same vendor + invoice number)
  const duplicates = Object.entries(grouped).filter(([_, invs]) => invs.length > 1);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicate invoice numbers:\n`);

  let totalToDelete = 0;
  const idsToDelete: string[] = [];

  duplicates.forEach(([key, invs]) => {
    const vendor = invs[0].vendors as any;
    console.log(`${vendor?.name || 'Unknown'} - Invoice #${invs[0].invoice_number}`);
    console.log(`  ${invs.length} copies found:`);

    invs.forEach((inv, idx) => {
      const mark = idx === 0 ? '✓ KEEP' : '✗ DELETE';
      console.log(`    ${mark} - ID: ${inv.id.substring(0, 8)}... created ${new Date(inv.created_at).toLocaleString()}`);

      // Keep the first one (oldest), delete the rest
      if (idx > 0) {
        idsToDelete.push(inv.id);
        totalToDelete++;
      }
    });
    console.log('');
  });

  console.log(`\n📊 Summary:`);
  console.log(`  Duplicate invoice numbers: ${duplicates.length}`);
  console.log(`  Total invoices to delete: ${totalToDelete}`);
  console.log(`  Total invoices to keep: ${duplicates.length}\n`);

  // Confirm deletion
  console.log('🗑️  Deleting duplicate invoices...\n');

  // Delete invoice_lines first (foreign key constraint)
  for (const invoiceId of idsToDelete) {
    const { error: linesError } = await supabase
      .from('invoice_lines')
      .delete()
      .eq('invoice_id', invoiceId);

    if (linesError) {
      console.error(`  ❌ Error deleting lines for invoice ${invoiceId}:`, linesError);
    }
  }

  // Delete invoices
  const { error: invoiceError } = await supabase
    .from('invoices')
    .delete()
    .in('id', idsToDelete);

  if (invoiceError) {
    console.error('❌ Error deleting invoices:', invoiceError);
    return;
  }

  console.log(`✅ Successfully deleted ${totalToDelete} duplicate invoices!\n`);
  console.log('Remaining invoices:');
  duplicates.forEach(([_, invs]) => {
    const vendor = invs[0].vendors as any;
    console.log(`  ✓ ${vendor?.name || 'Unknown'} - Invoice #${invs[0].invoice_number}`);
  });
}

main().catch(console.error);
