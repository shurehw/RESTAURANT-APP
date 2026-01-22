import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkR365FieldCoverage() {
  console.log('\n=== R365 Required Fields Coverage ===\n');

  const { data: items } = await supabase
    .from('items')
    .select(`
      *,
      item_pack_configurations(*),
      gl_accounts(external_code, name)
    `)
    .eq('is_active', true)
    .limit(948);

  const total = items?.length || 0;

  // Required fields for R365 import
  const requiredFields = {
    'ITEM': { count: 0, field: 'name' },
    'PACK SIZE': { count: 0, field: 'item_pack_configurations' },
    'SKU': { count: 0, field: 'sku' },
    'Item Category': { count: 0, field: 'gl_accounts' },
    'SUBCATEGORY': { count: 0, field: 'subcategory' },
    'Measure Type': { count: 0, field: 'r365_measure_type' },
    'Reporting UOM': { count: 0, field: 'r365_reporting_uom' },
    'Inventory UOM': { count: 0, field: 'r365_inventory_uom' },
    'Cost Account': { count: 0, field: 'r365_cost_account' },
    'Inventory Account': { count: 0, field: 'r365_inventory_account' },
    'Cost Update Method': { count: 0, field: 'r365_cost_update_method' },
    'Key Item': { count: 0, field: 'r365_key_item' }
  };

  for (const item of items || []) {
    // ITEM (name)
    if (item.name) requiredFields['ITEM'].count++;

    // PACK SIZE (has pack configs)
    const packConfigs = (item as any).item_pack_configurations || [];
    if (packConfigs.length > 0) requiredFields['PACK SIZE'].count++;

    // SKU
    if (item.sku) requiredFields['SKU'].count++;

    // Item Category (GL Account)
    const glAccount = (item as any).gl_accounts;
    if (glAccount?.external_code) requiredFields['Item Category'].count++;

    // SUBCATEGORY
    if (item.subcategory) requiredFields['SUBCATEGORY'].count++;

    // Measure Type
    if (item.r365_measure_type) requiredFields['Measure Type'].count++;

    // Reporting UOM
    if (item.r365_reporting_uom) requiredFields['Reporting UOM'].count++;

    // Inventory UOM
    if (item.r365_inventory_uom) requiredFields['Inventory UOM'].count++;

    // Cost Account
    if (item.r365_cost_account) requiredFields['Cost Account'].count++;

    // Inventory Account
    if (item.r365_inventory_account) requiredFields['Inventory Account'].count++;

    // Cost Update Method
    if (item.r365_cost_update_method) requiredFields['Cost Update Method'].count++;

    // Key Item (can be null/false, so always has a value)
    requiredFields['Key Item'].count++;
  }

  console.log('Field Coverage Report:\n');
  console.log('Field'.padEnd(25) + 'Coverage'.padEnd(15) + 'Status');
  console.log('─'.repeat(60));

  for (const [fieldName, data] of Object.entries(requiredFields)) {
    const percentage = ((data.count / total) * 100).toFixed(1);
    const status = data.count === total ? '✅' : data.count > 0 ? '⚠️ ' : '❌';

    console.log(
      fieldName.padEnd(25) +
      `${data.count}/${total} (${percentage}%)`.padEnd(15) +
      status
    );
  }

  // Check items without critical fields
  console.log('\n\n=== Items Missing Critical Fields ===\n');

  let itemsWithoutPackConfigs = 0;
  let itemsWithoutGLAccount = 0;
  let itemsWithoutSubcategory = 0;

  for (const item of items || []) {
    const packConfigs = (item as any).item_pack_configurations || [];
    const glAccount = (item as any).gl_accounts;

    if (packConfigs.length === 0) itemsWithoutPackConfigs++;
    if (!glAccount?.external_code) itemsWithoutGLAccount++;
    if (!item.subcategory) itemsWithoutSubcategory++;
  }

  console.log(`Items without Pack Configs: ${itemsWithoutPackConfigs}`);
  console.log(`Items without GL Account: ${itemsWithoutGLAccount}`);
  console.log(`Items without Subcategory: ${itemsWithoutSubcategory}`);

  // Sample items missing pack configs
  if (itemsWithoutPackConfigs > 0) {
    console.log('\nSample items without pack configs:');
    items?.filter(i => (i as any).item_pack_configurations?.length === 0)
      .slice(0, 10)
      .forEach(i => console.log(`  - ${i.name} (${i.sku})`));
  }
}

checkR365FieldCoverage().catch(console.error);
