import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyData() {
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  // Normalize column names
  const normalized = jsonData.map((row: any) => {
    const normalizedRow: any = {};
    for (const key in row) {
      const cleanKey = key.trim().replace(/\s+/g, '_');
      normalizedRow[cleanKey] = row[key];
    }
    return normalizedRow;
  });

  console.log(`\nChecking ${normalized.length} rows from Excel...\n`);

  // Group by item name
  const itemGroups = new Map<string, any[]>();
  for (const row of normalized) {
    const name = row.ITEM?.trim();
    if (!name) continue;

    if (!itemGroups.has(name)) {
      itemGroups.set(name, []);
    }
    itemGroups.get(name)!.push(row);
  }

  console.log(`Testing 10 random items for complete data match...\n`);

  const itemNames = Array.from(itemGroups.keys());
  const sampleSize = Math.min(10, itemNames.length);
  const samples = [];

  for (let i = 0; i < sampleSize; i++) {
    const randomIndex = Math.floor(Math.random() * itemNames.length);
    samples.push(itemNames[randomIndex]);
  }

  let allMatch = true;

  for (const itemName of samples) {
    const excelRows = itemGroups.get(itemName)!;
    const firstRow = excelRows[0];

    // Get item from database
    const { data: dbItems } = await supabase
      .from('items')
      .select('*')
      .ilike('name', itemName)
      .limit(1);

    if (!dbItems || dbItems.length === 0) {
      console.log(`❌ ${itemName}: NOT FOUND IN DATABASE`);
      allMatch = false;
      continue;
    }

    const dbItem = dbItems[0];

    // Get pack configs
    const { data: packConfigs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .eq('item_id', dbItem.id);

    console.log(`\n=== ${itemName} ===`);

    // Check SKU
    const excelSKU = firstRow.SKU?.toString().trim();
    const skuMatch = dbItem.sku === excelSKU;
    console.log(`SKU: ${skuMatch ? '✓' : '❌'} Excel: ${excelSKU}, DB: ${dbItem.sku}`);
    if (!skuMatch) allMatch = false;

    // Check Category (from Item Category 1 mapping)
    const excelCategory = firstRow.Item_Category_1;
    let expectedCategory = 'liquor';
    if (excelCategory?.includes('5320') || excelCategory?.includes('Wine')) expectedCategory = 'wine';
    else if (excelCategory?.includes('5330') || excelCategory?.includes('Beer')) expectedCategory = 'beverage';
    else if (excelCategory?.includes('5335') || excelCategory?.includes('N/A Beverage')) expectedCategory = 'non_alcoholic_beverage';
    else if (excelCategory?.includes('5315') || excelCategory?.includes('Bar Consumables')) expectedCategory = 'bar_consumables';

    const categoryMatch = dbItem.category === expectedCategory;
    console.log(`Category: ${categoryMatch ? '✓' : '❌'} Expected: ${expectedCategory}, DB: ${dbItem.category}`);
    if (!categoryMatch) allMatch = false;

    // Check Subcategory
    const excelSubcat = firstRow.SUBCATEGORY?.trim();
    const subcatMatch = dbItem.subcategory === excelSubcat || (!dbItem.subcategory && !excelSubcat);
    console.log(`Subcategory: ${subcatMatch ? '✓' : '❌'} Excel: ${excelSubcat || 'null'}, DB: ${dbItem.subcategory || 'null'}`);
    if (!subcatMatch && excelSubcat) allMatch = false;

    // Check R365 fields
    const r365Fields = [
      { field: 'r365_measure_type', excelField: 'Measure_Type' },
      { field: 'r365_reporting_uom', excelField: 'Reporting_U_of_M' },
      { field: 'r365_inventory_uom', excelField: 'Inventory_U_of_M' },
      { field: 'r365_cost_account', excelField: 'Cost_Account' },
      { field: 'r365_inventory_account', excelField: 'Inventory_Account' },
      { field: 'r365_cost_update_method', excelField: 'Cost_Update_Method' },
    ];

    let r365Match = true;
    for (const { field, excelField } of r365Fields) {
      const excelValue = firstRow[excelField];
      const dbValue = dbItem[field];
      if (excelValue && dbValue !== excelValue) {
        console.log(`  ${field}: ❌ Excel: ${excelValue}, DB: ${dbValue}`);
        r365Match = false;
        allMatch = false;
      }
    }
    if (r365Match) {
      console.log(`R365 Fields: ✓ All match`);
    }

    // Check pack configurations
    const expectedPacks = excelRows.length;
    const actualPacks = packConfigs?.length || 0;
    const packsMatch = expectedPacks === actualPacks;
    console.log(`Pack Configs: ${packsMatch ? '✓' : '❌'} Excel has ${expectedPacks} pack sizes, DB has ${actualPacks}`);
    if (!packsMatch) allMatch = false;
  }

  console.log('\n' + '='.repeat(50));
  if (allMatch) {
    console.log('✅ ALL SAMPLED DATA MATCHES 100%!');
  } else {
    console.log('❌ Some data mismatches found');
  }
  console.log('='.repeat(50) + '\n');

  // Overall stats
  const { data: allItems } = await supabase
    .from('items')
    .select('id, sku, r365_measure_type')
    .eq('is_active', true);

  const { data: allPacks } = await supabase
    .from('item_pack_configurations')
    .select('id, item_id');

  const itemsWithR365 = allItems?.filter(i => i.r365_measure_type).length || 0;
  const itemsWithRealSKU = allItems?.filter(i => i.sku && !i.sku.startsWith('AUTO-')).length || 0;

  console.log('Overall Statistics:');
  console.log(`  Total items in DB: ${allItems?.length || 0}`);
  console.log(`  Items with real SKUs: ${itemsWithRealSKU}`);
  console.log(`  Items with R365 fields: ${itemsWithR365}`);
  console.log(`  Total pack configurations: ${allPacks?.length || 0}`);
  console.log(`  Items from Excel: ${itemGroups.size}`);
}

verifyData();
