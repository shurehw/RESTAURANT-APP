import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  // Check invoice 5609444120 specifically
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', '5609444120')
    .single();

  if (!invoice) {
    console.log('Invoice not found');
    return;
  }

  console.log('Invoice 5609444120 details:');
  console.log('ID:', invoice.id);
  console.log('Invoice Number:', invoice.invoice_number);
  console.log('Created:', invoice.created_at);
  console.log('Storage Path:', invoice.storage_path || 'NULL');
  console.log('Has OCR Raw JSON?', invoice.ocr_raw_json ? 'YES' : 'NO');

  // Check if OCR data has lineItems
  if (invoice.ocr_raw_json) {
    const lineItemCount = invoice.ocr_raw_json.lineItems?.length || 0;
    console.log('Line items in OCR:', lineItemCount);
    console.log('Vendor from OCR:', invoice.ocr_raw_json.vendor);
  }

  // Check how many lines this invoice has in DB
  const { count } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true })
    .eq('invoice_id', invoice.id);

  console.log('Invoice lines in DB:', count);

  // Check if there are any invoices with storage_path for comparison
  console.log('\n--- Comparing with invoice that HAS PDF ---');
  const { data: withPdf } = await supabase
    .from('invoices')
    .select('id, invoice_number, created_at, storage_path')
    .not('storage_path', 'is', null)
    .limit(1)
    .single();

  if (withPdf) {
    console.log('Invoice with PDF:', withPdf.invoice_number);
    console.log('Storage Path:', withPdf.storage_path);
    console.log('Created:', withPdf.created_at);
  }
})();
