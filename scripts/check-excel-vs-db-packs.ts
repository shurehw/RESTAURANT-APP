import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkExcelVsDB() {
  // Read Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  const normalized = jsonData.map((row: any) => {
    const normalizedRow: any = {};
    for (const key in row) {
      const cleanKey = key.trim().replace(/\s+/g, '_');
      normalizedRow[cleanKey] = row[key];
    }
    return normalizedRow;
  });

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

  console.log(`\nExcel has ${itemGroups.size} unique items\n`);

  // Get items from DB
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, name')
    .eq('is_active', true);

  const { data: packs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const packItemIds = new Set(packs?.map(p => p.item_id));

  let inExcelWithPacks = 0;
  let inExcelWithoutPacks = 0;
  const missingPacks: string[] = [];

  for (const [itemName, excelRows] of itemGroups.entries()) {
    // Find in DB
    const dbItem = dbItems?.find(i => i.name.toLowerCase() === itemName.toLowerCase());

    if (dbItem) {
      if (packItemIds.has(dbItem.id)) {
        inExcelWithPacks++;
      } else {
        inExcelWithoutPacks++;
        missingPacks.push(itemName);
      }
    }
  }

  console.log('Excel items found in DB with pack configs:', inExcelWithPacks);
  console.log('Excel items found in DB WITHOUT pack configs:', inExcelWithoutPacks);
  console.log('Expected:', itemGroups.size);
  console.log('Missing:', itemGroups.size - inExcelWithPacks);

  if (missingPacks.length > 0) {
    console.log('\nFirst 20 Excel items missing pack configs:');
    missingPacks.slice(0, 20).forEach(name => {
      const rows = itemGroups.get(name)!;
      console.log(`  ${name} (${rows.length} pack size(s) in Excel)`);
      rows.slice(0, 2).forEach(r => console.log(`    - ${r.PACK_SIZE}`));
    });
  }
}

checkExcelVsDB();
