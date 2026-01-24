import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
async function importBeverages() {
  // Get organization ID from existing items
  const { data: existingItems } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);

  if (!existingItems || existingItems.length === 0) {
    console.error('No existing items found. Cannot determine organization ID.');
    return;
  }

  const ORGANIZATION_ID = existingItems[0].organization_id;
  console.log('Using organization ID:', ORGANIZATION_ID);
  console.log('');
  console.log('Reading beverage import file:', excelPath);

  const workbook = XLSX.readFile(excelPath);
  const worksheet = workbook.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

  console.log(`Found ${rows.length} rows\n`);

  // Map category from Item Category 1 field
  function mapCategory(itemCategory1: string, subcategory: string): string {
    const lower = (itemCategory1 || '').toLowerCase();
    const sub = (subcategory || '').toLowerCase();

    if (lower.includes('liquor') || sub.includes('tequila') || sub.includes('vodka') ||
        sub.includes('gin') || sub.includes('rum') || sub.includes('whiskey') ||
        sub.includes('bourbon') || sub.includes('cognac')) {
      return 'liquor';
    }
    if (lower.includes('wine') || sub.includes('wine')) return 'wine';
    if (lower.includes('beer') || sub.includes('beer')) return 'beer';
    if (lower.includes('bar') || sub.includes('mixer') || sub.includes('juice')) return 'bar_consumables';

    return 'liquor'; // Default for beverages
  }

  // Deduplicate by name (keep first occurrence)
  const seen = new Map<string, any>();
  rows.forEach(row => {
    const name = (row['ITEM      '] || '').trim();
    if (name && !seen.has(name)) {
      seen.set(name, row);
    }
  });

  const uniqueRows = Array.from(seen.values());
  console.log(`Deduped to ${uniqueRows.length} unique items\n`);

  const items = uniqueRows.map((row: any) => {
    const name = (row['ITEM      '] || '').trim();
    const packSize = (row['PACK SIZE      '] || '').trim();
    const sku = String(row['SKU      '] || '').trim();
    const itemCategory1 = (row['Item Category 1'] || '').trim();
    const subcategory = (row['SUBCATEGORY      '] || '').trim();
    const reportingUom = (row['Reporting U of M'] || '').trim();
    const inventoryUom = (row['Inventory U of M'] || '').trim();
    const costAccount = (row['Cost Account'] || '').trim();
    const inventoryAccount = (row['Inventory Account'] || '').trim();
    const measureType = (row['Measure Type'] || 'Volume').trim();

    const category = mapCategory(itemCategory1, subcategory);

    return {
      name,
      sku: sku || `BEV-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      category,
      subcategory: subcategory || null,
      base_uom: inventoryUom || reportingUom || 'unit',
      organization_id: ORGANIZATION_ID,
      is_active: true,
      item_type: 'beverage',
      r365_measure_type: measureType,
      r365_reporting_uom: reportingUom || null,
      r365_inventory_uom: inventoryUom || null,
      r365_cost_account: costAccount || null,
      r365_inventory_account: inventoryAccount || null,
    };
  });

  console.log('Sample item:');
  console.log(JSON.stringify(items[0], null, 2));
  console.log('\n');

  // Insert in batches
  const BATCH_SIZE = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('items')
      .insert(batch)
      .select('id, name');

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += data?.length || 0;
      console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${data?.length} items (total: ${inserted})`);
    }
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${items.length}`);

  // Verify Don Julio
  console.log('\n\nVerifying Don Julio items...');
  const { data: donJulio } = await supabase
    .from('items')
    .select('name, sku, category')
    .ilike('name', '%don julio%')
    .limit(10);

  console.log(`Found ${donJulio?.length || 0} Don Julio items:`);
  donJulio?.forEach((item: any) => {
    console.log(`  - ${item.name} (${item.sku})`);
  });
}

importBeverages().catch(console.error);
