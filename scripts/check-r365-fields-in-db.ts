import { createClient } from '@supabase/supabase-js';

async function checkR365Fields() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('organization_id', '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41')
    .limit(1)
    .single();

  console.log('Sample item R365 fields:');
  console.log('Name:', item?.name);
  console.log('SKU:', item?.sku);
  console.log('\nR365 Fields:');

  const r365Fields = [
    'r365_measure_type',
    'r365_reporting_uom',
    'r365_inventory_uom',
    'r365_cost_account',
    'r365_inventory_account',
    'r365_cost_update_method',
    'r365_key_item'
  ];

  r365Fields.forEach(field => {
    console.log(`  ${field}: ${(item as any)?.[field] || 'NULL'}`);
  });

  console.log('\nGL Fields:');
  console.log('  gl_account_id:', item?.gl_account_id || 'NULL');

  // Check required fields from R365 docs
  console.log('\n✅ R365 Required Fields:');
  console.log('  Name:', item?.name ? '✓' : '✗');
  console.log('  Measure Type:', item?.r365_measure_type ? '✓' : '✗');
  console.log('  Reporting U of M:', item?.r365_reporting_uom ? '✓' : '✗');
  console.log('  Inventory U of M:', item?.r365_inventory_uom ? '✓' : '✗');
  console.log('  Cost Account:', item?.r365_cost_account ? '✓' : '✗');
  console.log('  Inventory Account:', item?.r365_inventory_account ? '✓' : '✗');
}

checkR365Fields();
