import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkRLS() {
  const supabase = createAdminClient();

  // Check if RLS is enabled on invoice_line_items
  const { data: rlsStatus } = await supabase.rpc('pg_get_rlsinfo', {
    table_name: 'invoice_line_items'
  }).single();

  console.log('\n🔒 RLS Status for invoice_line_items:');
  console.log(rlsStatus);

  // Try to insert a test line item
  console.log('\n🧪 Testing line item insert...');
  
  const { data: testInvoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('venue_id', '79c33e6a-eb21-419f-9606-7494d1a9584c')
    .limit(1)
    .single();

  if (!testInvoice) {
    console.log('❌ No test invoice found');
    return;
  }

  const { data: insertData, error: insertError } = await supabase
    .from('invoice_line_items')
    .insert({
      invoice_id: testInvoice.id,
      description: 'TEST ITEM',
      quantity: 1,
      unit_cost: 10.00,
      line_total: 10.00
    })
    .select();

  if (insertError) {
    console.log('❌ Insert failed:');
    console.log(insertError);
  } else {
    console.log('✅ Insert succeeded:');
    console.log(insertData);
    
    // Clean up test item
    await supabase
      .from('invoice_line_items')
      .delete()
      .eq('id', insertData[0].id);
    console.log('✅ Test item cleaned up');
  }
}

checkRLS()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
