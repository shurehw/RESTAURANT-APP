import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixMissingImages() {
  console.log('🔍 Investigating invoices without images...\n');

  // Get invoices without storage_path
  const { data: withoutStorage } = await supabase
    .from('invoices')
    .select('*')
    .is('storage_path', null)
    .order('created_at', { ascending: false });

  console.log(`Found ${withoutStorage?.length || 0} invoices without storage_path\n`);

  // Check for duplicates by invoice number
  const invoiceNumbers = withoutStorage?.map(inv => inv.invoice_number).filter(Boolean) || [];

  for (const invoiceNum of invoiceNumbers) {
    const { data: allWithSameNumber } = await supabase
      .from('invoices')
      .select('id, invoice_number, storage_path, vendor_id, invoice_date, created_at')
      .eq('invoice_number', invoiceNum)
      .order('created_at', { ascending: false });

    if (allWithSameNumber && allWithSameNumber.length > 1) {
      console.log(`\n📋 Invoice #${invoiceNum} - Found ${allWithSameNumber.length} copies:`);

      const withImage = allWithSameNumber.filter(inv => inv.storage_path);
      const withoutImage = allWithSameNumber.filter(inv => !inv.storage_path);

      console.log(`  ✅ With image: ${withImage.length}`);
      console.log(`  ❌ Without image: ${withoutImage.length}`);

      if (withImage.length > 0 && withoutImage.length > 0) {
        console.log(`  💡 Solution: Delete ${withoutImage.length} duplicate(s) without images`);

        // Show what we'd delete
        withoutImage.forEach(inv => {
          console.log(`     - ID: ${inv.id} (created: ${new Date(inv.created_at).toLocaleString()})`);
        });
      }

      // Show the one to keep
      if (withImage.length > 0) {
        console.log(`  ✓ Keep: ${withImage[0].id} with storage_path: ${withImage[0].storage_path}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATION:');
  console.log('Delete duplicate invoices without storage_path');
  console.log('='.repeat(60));
}

fixMissingImages();
