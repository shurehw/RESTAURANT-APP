import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteDuplicates() {
  // IDs to delete (duplicates without storage_path)
  const duplicateIds = [
    'ac1df9ff-de11-4062-89b9-c76cc44a880e', // 16928603
    '033395ea-8c42-4618-ac11-861d18560fa1', // 9130139318
    'd893e482-7b89-4a69-aa58-58933afa3e9a', // 16862910
    'b681ae66-cd82-443a-9ed6-98015f518f74', // 16862910
    '07e37f29-0bff-4f8b-843c-71424ad1ee89', // 1841471
    '65409530-aa9d-4138-b1ef-de0cd86f99cf', // 1841471
  ];

  console.log(`🗑️  Deleting ${duplicateIds.length} duplicate invoices without images...\n`);

  for (const id of duplicateIds) {
    // First delete invoice lines
    const { error: linesError } = await supabase
      .from('invoice_lines')
      .delete()
      .eq('invoice_id', id);

    if (linesError) {
      console.error(`❌ Error deleting lines for ${id}:`, linesError.message);
      continue;
    }

    // Then delete the invoice
    const { error: invoiceError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id);

    if (invoiceError) {
      console.error(`❌ Error deleting invoice ${id}:`, invoiceError.message);
    } else {
      console.log(`✅ Deleted duplicate invoice ${id}`);
    }
  }

  console.log('\n✅ Done! Verifying results...\n');

  // Verify
  const { data: remaining } = await supabase
    .from('invoices')
    .select('id, invoice_number, storage_path')
    .is('storage_path', null);

  console.log(`📊 Remaining invoices without storage: ${remaining?.length || 0}`);

  if (remaining && remaining.length > 0) {
    console.log('\nRemaining invoices:');
    remaining.forEach(inv => {
      console.log(`  - ${inv.invoice_number} (${inv.id})`);
    });
  }
}

deleteDuplicates();
