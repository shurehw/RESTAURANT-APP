import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function findNullOcrInvoices() {
  const supabase = createAdminClient();

  console.log('\n🔍 FINDING INVOICES WITH NULL OCR DATA\n');

  const { data, count } = await supabase
    .from('invoices')
    .select('invoice_number, invoice_date, total_amount, created_at, ocr_raw_json, ocr_confidence, storage_path, vendors!inner(name)', { count: 'exact' })
    .is('ocr_raw_json', null)
    .gt('total_amount', 0)
    .order('created_at', { ascending: false })
    .limit(20);

  console.log(`Total invoices with NULL ocr_raw_json: ${count}\n`);
  console.log('Recent 20 invoices:\n');

  data?.forEach((i, idx) => {
    console.log(`${idx + 1}. #${i.invoice_number}`);
    console.log(`   Vendor: ${(i.vendors as any)?.name}`);
    console.log(`   Total: $${i.total_amount}`);
    console.log(`   Invoice Date: ${i.invoice_date}`);
    console.log(`   Created: ${i.created_at}`);
    console.log(`   OCR Confidence: ${i.ocr_confidence || 'none'}`);
    console.log(`   Has Storage: ${i.storage_path ? 'Yes' : 'No'}`);
    console.log('');
  });
}

findNullOcrInvoices()
  .then(() => process.exit(0))
  .catch(console.error);
