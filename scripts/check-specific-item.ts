import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkItem() {
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

  const itemName = 'Antica Formula Vermouth 1L';

  console.log(`\n=== Excel Data for "${itemName}" ===\n`);

  const excelRows = normalized.filter(r => r.ITEM?.trim() === itemName);
  console.log(`Found ${excelRows.length} rows in Excel:\n`);

  for (const row of excelRows) {
    console.log(`Pack Size: ${row.PACK_SIZE}`);
    console.log(`  SKU: ${row.SKU || 'MISSING'}`);
    console.log(`  Category: ${row.Item_Category_1}`);
    console.log(`  Subcategory: ${row.SUBCATEGORY || 'null'}`);
    console.log(`  Measure Type: ${row.Measure_Type}`);
    console.log('');
  }

  // Check database
  const { data: dbItems } = await supabase
    .from('items')
    .select('*')
    .ilike('name', itemName);

  console.log(`\n=== Database Data ===\n`);
  if (dbItems && dbItems.length > 0) {
    const item = dbItems[0];
    console.log(`SKU: ${item.sku}`);
    console.log(`Category: ${item.category}`);
    console.log(`Subcategory: ${item.subcategory || 'null'}`);
    console.log(`R365 Measure Type: ${item.r365_measure_type || 'MISSING'}`);
    console.log(`R365 Reporting UOM: ${item.r365_reporting_uom || 'MISSING'}`);
    console.log(`R365 Cost Account: ${item.r365_cost_account || 'MISSING'}`);

    // Get pack configs
    const { data: packs } = await supabase
      .from('item_pack_configurations')
      .select('*')
      .eq('item_id', item.id);

    console.log(`\nPack Configurations: ${packs?.length || 0}`);
    for (const pack of packs || []) {
      console.log(`  ${pack.pack_type}: ${pack.units_per_pack}x ${pack.unit_size}${pack.unit_size_uom}`);
      console.log(`    Vendor Item Code: ${pack.vendor_item_code || 'null'}`);
    }
  } else {
    console.log('NOT FOUND IN DATABASE');
  }
}

checkItem();
