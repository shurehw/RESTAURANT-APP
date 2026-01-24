import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkUniqueMissing() {
  // Check the 3 unique ones without duplicates
  const uniqueIds = [
    'bcd6ebf3-bc54-4b55-87c7-23a1c747485b', // 16900368
    '8771ae9b-68f7-440f-afea-3026b3d1db88', // 66343
    '1f1e5747-dbb3-4b1e-b4fd-9717f32726ec', // 70238322
  ];

  console.log('🔍 Checking invoices without duplicates:\n');

  for (const id of uniqueIds) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, vendor:vendors(name)')
      .eq('id', id)
      .single();

    if (invoice) {
      console.log(`Invoice #${invoice.invoice_number}`);
      console.log(`  ID: ${invoice.id}`);
      console.log(`  Vendor: ${invoice.vendor?.name || 'Unknown'}`);
      console.log(`  Date: ${invoice.invoice_date || 'N/A'}`);
      console.log(`  Created: ${new Date(invoice.created_at).toLocaleString()}`);
      console.log(`  Storage: ${invoice.storage_path || 'MISSING'}`);

      // Check if there's a similar invoice WITH storage
      const { data: similar } = await supabase
        .from('invoices')
        .select('id, invoice_number, storage_path, created_at')
        .eq('invoice_number', invoice.invoice_number)
        .not('storage_path', 'is', null);

      if (similar && similar.length > 0) {
        console.log(`  🔗 Found similar invoice WITH storage:`);
        similar.forEach(s => {
          console.log(`     - ID: ${s.id}, storage: ${s.storage_path}`);
        });
      } else {
        console.log(`  ⚠️  No similar invoice with storage found - truly missing`);
      }
      console.log('');
    }
  }
}

checkUniqueMissing();
