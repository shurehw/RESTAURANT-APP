import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigration() {
  console.log('Testing if the migration was applied...\n');

  // Test with dummy data to see what error we get
  const testInvoiceData = {
    venue_id: '00000000-0000-0000-0000-000000000000',
    vendor_id: '00000000-0000-0000-0000-000000000000',
    invoice_number: 'TEST-' + Date.now(),
    invoice_date: new Date().toISOString().split('T')[0],
    total_amount: 100.00,
    ocr_confidence: 0.95,
    is_preopening: false,
  };

  const testLinesData = [
    {
      description: 'Test Item',
      quantity: 1,
      unit_cost: 100.00,
      ocr_confidence: 0.95,
    }
  ];

  const { data, error } = await supabase.rpc('create_invoice_with_lines', {
    invoice_data: testInvoiceData,
    lines_data: testLinesData,
  });

  if (error) {
    console.log('❌ Error occurred:', error);
    console.log('\nError details:');
    console.log('- Code:', error.code);
    console.log('- Message:', error.message);
    console.log('- Details:', error.details);
    console.log('- Hint:', error.hint);

    if (error.code === '23502') {
      console.log('\n🔍 Error 23502 = NOT NULL violation');
      console.log('The migration may not have been applied, or there is another NOT NULL field issue.');
    }
  } else {
    console.log('✅ Function executed (may have failed due to invalid test data, but at least it ran)');
    console.log('Result:', data);
  }
}

verifyMigration();
