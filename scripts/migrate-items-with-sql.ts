import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrate() {
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet) as any[];

  console.log(`Read ${data.length} rows from Excel`);

  // Group by item name
  const itemsMap = new Map<string, any[]>();
  for (const row of data) {
    const itemName = row.ITEM?.trim();
    if (!itemName) continue;

    if (!itemsMap.has(itemName)) {
      itemsMap.set(itemName, []);
    }
    itemsMap.get(itemName)!.push(row);
  }

  console.log(`Grouped into ${itemsMap.size} unique items`);

  let updated = 0;
  let failed = 0;

  for (const [itemName, rows] of itemsMap) {
    const firstRow = rows[0];

    // Find existing item by name
    const { data: existingItems } = await supabase
      .from('items')
      .select('id, name, sku, organization_id')
      .ilike('name', itemName)
      .limit(1);

    if (!existingItems || existingItems.length === 0) {
      continue;
    }

    const existingItem = existingItems[0];
    const originalSKU = firstRow.SKU?.toString().trim();

    try {
      // 1. Update item with SKU and R365 fields
      const updateData: any = {};
      if (originalSKU) {
        updateData.sku = originalSKU;
      }
      updateData.r365_measure_type = firstRow['Measure Type'] || null;
      updateData.r365_reporting_uom = firstRow['Reporting U of M'] || null;
      updateData.r365_inventory_uom = firstRow['Inventory U of M'] || null;
      updateData.r365_cost_account = firstRow['Cost Account'] || null;
      updateData.r365_inventory_account = firstRow['Inventory Account'] || null;
      updateData.r365_cost_update_method = firstRow['Cost Update Method'] || null;
      updateData.r365_key_item = firstRow['Key Item'] === 'TRUE' || firstRow['Key Item'] === true;

      const { error: updateError } = await supabase
        .from('items')
        .update(updateData)
        .eq('id', existingItem.id);

      if (updateError) {
        console.error(`❌ Failed to update ${itemName}:`, updateError.message);
        failed++;
        continue;
      }

      // 2. Use raw SQL to insert pack configs (bypass schema cache)
      // First delete old configs
      await supabase.rpc('execute_sql', {
        query: `DELETE FROM item_pack_configs WHERE item_id = '${existingItem.id}'`
      });

      // Build pack configs from rows
      const packConfigs = [];
      for (const row of rows) {
        const packSize = row['PACK SIZE']?.toString().trim();
        const vendorSKU = row.SKU?.toString().trim();

        if (!packSize) continue;

        // Parse pack size
        const packMatch = packSize.match(/^(\d+)\s*x\s*(\d+\.?\d*)(ml|l|oz)$/i);
        if (packMatch) {
          const unitsPerPack = parseInt(packMatch[1], 10);
          const unitSize = parseFloat(packMatch[2]);
          const unitSizeUom = packMatch[3].toLowerCase();

          packConfigs.push({
            item_id: existingItem.id,
            pack_type: 'case',
            units_per_pack: unitsPerPack,
            unit_size: unitSize,
            unit_size_uom: unitSizeUom,
            vendor_sku: vendorSKU
          });
        } else {
          // Single unit (bottle)
          const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz)$/i);
          if (singleMatch) {
            const unitSize = parseFloat(singleMatch[1]);
            const unitSizeUom = singleMatch[2].toLowerCase();

            packConfigs.push({
              item_id: existingItem.id,
              pack_type: 'unit',
              units_per_pack: 1,
              unit_size: unitSize,
              unit_size_uom: unitSizeUom,
              vendor_sku: vendorSKU
            });
          }
        }
      }

      // Insert pack configs using raw SQL
      for (const config of packConfigs) {
        const sql = `
          INSERT INTO item_pack_configs (item_id, pack_type, units_per_pack, unit_size, unit_size_uom, vendor_sku)
          VALUES ('${config.item_id}', '${config.pack_type}', ${config.units_per_pack}, ${config.unit_size}, '${config.unit_size_uom}', ${config.vendor_sku ? `'${config.vendor_sku}'` : 'NULL'})
        `;

        const { error: insertError } = await supabase.rpc('execute_sql', { query: sql });
        if (insertError) {
          console.error(`❌ Failed to insert pack config for ${itemName}:`, insertError.message);
        }
      }

      updated++;
      if (updated % 50 === 0) {
        console.log(`Progress: ${updated} items updated...`);
      }

    } catch (error: any) {
      console.error(`❌ Failed to process ${itemName}:`, error.message);
      failed++;
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`Updated: ${updated} items`);
  console.log(`Failed: ${failed} items`);
}

migrate();
