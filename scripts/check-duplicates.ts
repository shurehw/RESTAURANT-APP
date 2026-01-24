import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  console.log('🔍 Checking for duplicate invoices...\n');

  const { data: duplicates } = await supabase
    .from('invoices')
    .select('vendor_id, invoice_number, vendors(name), created_at')
    .not('invoice_number', 'is', null)
    .order('invoice_number');

  if (!duplicates) {
    console.log('No invoices found');
    return;
  }

  // Group by vendor + invoice number
  const grouped = duplicates.reduce((acc, inv) => {
    const key = `${inv.vendor_id}-${inv.invoice_number}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(inv);
    return acc;
  }, {} as Record<string, any[]>);

  // Find duplicates
  const dupes = Object.entries(grouped).filter(([_, invs]) => invs.length > 1);

  if (dupes.length === 0) {
    console.log('✅ No duplicates found!');
  } else {
    console.log(`⚠️  Found ${dupes.length} duplicate invoice numbers:\n`);
    dupes.forEach(([key, invs]) => {
      console.log(`${invs[0].vendors?.name || 'Unknown'} - Invoice #${invs[0].invoice_number}`);
      console.log(`  ${invs.length} copies created at:`);
      invs.forEach(inv => {
        console.log(`    - ${new Date(inv.created_at).toLocaleString()}`);
      });
      console.log('');
    });
  }
})();
