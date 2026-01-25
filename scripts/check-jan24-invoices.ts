import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkJan24Invoices() {
  const supabase = createAdminClient();

  console.log('\n🔍 CHECKING ALL JAN 24 INVOICES\n');

  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, ocr_raw_json, ocr_confidence, created_at')
    .gte('created_at', '2026-01-24T00:00:00')
    .lte('created_at', '2026-01-25T00:00:00')
    .order('created_at', { ascending: true });

  const withOcr = data?.filter(i => i.ocr_raw_json && Object.keys(i.ocr_raw_json).length > 0) || [];
  const withoutOcr = data?.filter(i => !i.ocr_raw_json || Object.keys(i.ocr_raw_json).length === 0) || [];

  console.log('Invoices created on Jan 24, 2026:');
  console.log(`Total: ${data?.length || 0}`);
  console.log(`With OCR data: ${withOcr.length}`);
  console.log(`Without OCR data: ${withoutOcr.length}`);

  if (withOcr.length > 0) {
    console.log('\n✅ Sample WITH OCR data:');
    withOcr.slice(0, 5).forEach(i => {
      console.log(`  - #${i.invoice_number} (confidence: ${i.ocr_confidence}) at ${i.created_at}`);
    });
  }

  if (withoutOcr.length > 0) {
    console.log('\n❌ Sample WITHOUT OCR data (but has confidence!):');
    withoutOcr.slice(0, 5).forEach(i => {
      console.log(`  - #${i.invoice_number} (confidence: ${i.ocr_confidence}) at ${i.created_at}`);
    });
  }

  // Check time distribution
  const byHour = data?.reduce((acc: any, inv) => {
    const hour = new Date(inv.created_at).getHours();
    if (!acc[hour]) acc[hour] = { with: 0, without: 0 };
    if (inv.ocr_raw_json && Object.keys(inv.ocr_raw_json).length > 0) {
      acc[hour].with++;
    } else {
      acc[hour].without++;
    }
    return acc;
  }, {});

  console.log('\n📊 Distribution by hour:');
  Object.entries(byHour || {})
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([hour, counts]: [string, any]) => {
      console.log(`  ${hour}:00 - With OCR: ${counts.with}, Without: ${counts.without}`);
    });
}

checkJan24Invoices()
  .then(() => process.exit(0))
  .catch(console.error);
