import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkInvoiceImages() {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor:vendors(name), storage_path')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('\n=== Recent Invoices ===\n');
  data?.forEach((invoice: any) => {
    console.log(`Invoice: ${invoice.invoice_number || 'N/A'}`);
    console.log(`Vendor: ${invoice.vendor?.name || 'Unknown'}`);
    console.log(`Storage Path: ${invoice.storage_path || 'NOT STORED'}`);
    console.log('---');
  });

  const withImages = data?.filter((inv: any) => inv.storage_path) || [];
  const total = data?.length || 0;

  console.log(`\nSummary: ${withImages.length}/${total} invoices have stored files`);
}

checkInvoiceImages();
