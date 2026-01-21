import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyPackCoverage() {
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

  console.log(`\n=== PACK CONFIG COVERAGE VERIFICATION ===\n`);
  console.log(`Excel has ${itemGroups.size} unique items\n`);

  // Get all items from DB
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true);

  const { data: allPacks } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const packItemIds = new Set(allPacks?.map(p => p.item_id));

  // Check Excel items
  let excelItemsInDB = 0;
  let excelItemsWithPacks = 0;
  let excelItemsWithoutPacks = 0;
  const missingPacksFromExcel: Array<{name: string, packSizes: string[]}> = [];

  for (const [itemName, rows] of itemGroups.entries()) {
    const dbItem = dbItems?.find(i => i.name.toLowerCase() === itemName.toLowerCase());

    if (dbItem) {
      excelItemsInDB++;

      if (packItemIds.has(dbItem.id)) {
        excelItemsWithPacks++;
      } else {
        excelItemsWithoutPacks++;
        const packSizes = rows.map(r => r.PACK_SIZE).filter(Boolean);
        missingPacksFromExcel.push({ name: itemName, packSizes });
      }
    }
  }

  // Check non-Excel items (created from invoices)
  const nonExcelItems = dbItems?.filter(dbItem => {
    return !Array.from(itemGroups.keys()).some(
      excelName => excelName.toLowerCase() === dbItem.name.toLowerCase()
    );
  }) || [];

  const nonExcelWithPacks = nonExcelItems.filter(i => packItemIds.has(i.id)).length;
  const nonExcelWithoutPacks = nonExcelItems.filter(i => !packItemIds.has(i.id)).length;

  console.log('=== EXCEL ITEMS (should all have packs) ===');
  console.log(`Total Excel items in DB: ${excelItemsInDB}`);
  console.log(`  ✅ With pack configs: ${excelItemsWithPacks} (${Math.round(excelItemsWithPacks/excelItemsInDB*100)}%)`);
  console.log(`  ❌ WITHOUT pack configs: ${excelItemsWithoutPacks} (${Math.round(excelItemsWithoutPacks/excelItemsInDB*100)}%)`);

  console.log(`\n=== NON-EXCEL ITEMS (invoice-created, OK to be missing) ===`);
  console.log(`Total non-Excel items: ${nonExcelItems.length}`);
  console.log(`  With packs: ${nonExcelWithPacks}`);
  console.log(`  Without packs: ${nonExcelWithoutPacks}`);

  console.log(`\n=== OVERALL ===`);
  console.log(`Total items in DB: ${dbItems?.length || 0}`);
  console.log(`Total with pack configs: ${packItemIds.size} (${Math.round(packItemIds.size/(dbItems?.length||1)*100)}%)`);
  console.log(`Total pack configs: ${allPacks?.length || 0}`);

  if (excelItemsWithoutPacks > 0) {
    console.log(`\n=== EXCEL ITEMS MISSING PACK CONFIGS (first 20) ===`);
    missingPacksFromExcel.slice(0, 20).forEach(item => {
      console.log(`\n${item.name}`);
      console.log(`  Pack sizes in Excel: ${item.packSizes.join(', ')}`);

      // Check why they might be missing
      if (item.packSizes.length === 0) {
        console.log(`  ⚠️  No pack sizes in Excel`);
      } else if (item.packSizes.some(ps => ps === null || ps === undefined)) {
        console.log(`  ⚠️  Has null pack size`);
      } else {
        console.log(`  ❌ Should have matched but didn't!`);
      }
    });
  }
}

verifyPackCoverage();
