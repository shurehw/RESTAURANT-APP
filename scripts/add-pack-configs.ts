import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function addPackConfigs() {
  console.log('Reading Excel file...\n');

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

  console.log(`Loaded ${normalized.length} rows from Excel\n`);

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

  console.log(`Found ${itemGroups.size} unique items\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const [itemName, rows] of itemGroups.entries()) {
    try {
      // Find existing item by name
      const { data: existingItems } = await supabase
        .from('items')
        .select('id, name')
        .ilike('name', itemName)
        .limit(1);

      if (!existingItems || existingItems.length === 0) {
        skipped++;
        continue;
      }

      const existingItem = existingItems[0];

      // Delete existing pack configs
      await supabase
        .from('item_pack_configurations')
        .delete()
        .eq('item_id', existingItem.id);

      // Build pack configs from Excel rows
      const packConfigMap = new Map<string, any>();

      for (const row of rows) {
        const packSize = row.PACK_SIZE?.trim();
        if (!packSize) continue;

        // Match case format: "6 x 750ml" or "3.3 x 1lb" or "400 x 1g" or "1 x 1case"
        const packMatch = packSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);
        // Match single unit: "750ml" or "1gal" or "1kg" or "1case" or "1pack" or "1quart"
        const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);

        let configKey = '';
        let config: any = null;

        if (packMatch) {
          const unitsPerPack = parseInt(packMatch[1]);
          const unitSize = parseFloat(packMatch[2]);
          const unitSizeUom = packMatch[3].toLowerCase();

          configKey = `case-${unitsPerPack}-${unitSize}-${unitSizeUom}`;
          config = {
            item_id: existingItem.id,
            pack_type: 'case',
            units_per_pack: unitsPerPack,
            unit_size: unitSize,
            unit_size_uom: unitSizeUom,
            vendor_item_code: row.SKU?.toString().trim() || null,
          };
        } else if (singleMatch) {
          const unitSize = parseFloat(singleMatch[1]);
          const unitSizeUom = singleMatch[2].toLowerCase();

          configKey = `bottle-1-${unitSize}-${unitSizeUom}`;
          config = {
            item_id: existingItem.id,
            pack_type: 'bottle',
            units_per_pack: 1,
            unit_size: unitSize,
            unit_size_uom: unitSizeUom,
            vendor_item_code: row.SKU?.toString().trim() || null,
          };
        }

        if (config && !packConfigMap.has(configKey)) {
          packConfigMap.set(configKey, config);
        }
      }

      const packConfigs = Array.from(packConfigMap.values());

      if (packConfigs.length > 0) {
        // Insert configs one at a time in a transaction-like manner
        for (const config of packConfigs) {
          const { error: insertError } = await supabase
            .from('item_pack_configurations')
            .insert([config]);

          if (insertError) {
            console.error(`❌ ${itemName}: ${insertError.message}`);
            errors++;
            break;
          }
        }

        console.log(`✓ ${itemName}: Added ${packConfigs.length} pack config(s)`);
        updated++;
      }

    } catch (error: any) {
      console.error(`❌ Error processing ${itemName}:`, error.message);
      errors++;
    }

    // Progress indicator every 100 items
    if ((updated + skipped + errors) % 100 === 0) {
      console.log(`\nProgress: ${updated} updated, ${skipped} skipped, ${errors} errors\n`);
    }
  }

  console.log('\n=== Pack Config Migration Complete ===');
  console.log(`✅ Updated: ${updated}`);
  console.log(`⚠️  Skipped (not in DB): ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
}

addPackConfigs();
