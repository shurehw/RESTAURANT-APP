import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      invoice:invoices(
        id,
        invoice_number,
        storage_path
      )
    `)
    .is('item_id', null)
    .gt('qty', 0)
    .limit(5);

  console.log('Sample unmapped lines with invoice data:\n');
  data?.forEach((line, i) => {
    console.log(`[${i + 1}] ${line.description}`);
    console.log('Invoice ID:', line.invoice?.id);
    console.log('Invoice Number:', line.invoice?.invoice_number);
    console.log('Storage Path:', line.invoice?.storage_path || 'NO STORAGE PATH');
    console.log('---\n');
  });
})();
