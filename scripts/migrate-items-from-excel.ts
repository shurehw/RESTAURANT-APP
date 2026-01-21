import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function migrateItemsFromExcel() {
  console.log('Reading Excel file...\n');

  // Read the Excel file
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
  let notFound = 0;
  let errors = 0;

  for (const [itemName, rows] of itemGroups.entries()) {
    try {
      // Find existing item by name
      const { data: existingItems } = await supabase
        .from('items')
        .select('id, name, sku')
        .ilike('name', itemName)
        .limit(1);

      if (!existingItems || existingItems.length === 0) {
        console.log(`⚠️  Not found in DB: ${itemName}`);
        notFound++;
        continue;
      }

      const existingItem = existingItems[0];
      const firstRow = rows[0];

      // Get the original SKU from Excel (first row's SKU)
      const originalSKU = firstRow.SKU?.toString().trim();

      // Only update if the item has an AUTO- SKU
      if (!existingItem.sku.startsWith('AUTO-')) {
        console.log(`✓ Skipping ${itemName} (already has real SKU: ${existingItem.sku})`);
        continue;
      }

      console.log(`Updating: ${itemName}`);
      console.log(`  Old SKU: ${existingItem.sku}`);
      console.log(`  New SKU: ${originalSKU || '(keeping AUTO)'}`);

      // Update SKU and R365 fields
      const updateData: any = {};

      if (originalSKU) {
        updateData.sku = originalSKU;
      }

      // Add R365 fields for round-trip compatibility
      updateData.r365_measure_type = firstRow.Measure_Type || null;
      updateData.r365_reporting_uom = firstRow.Reporting_U_of_M || null;
      updateData.r365_inventory_uom = firstRow.Inventory_U_of_M || null;
      updateData.r365_cost_account = firstRow.Cost_Account || null;
      updateData.r365_inventory_account = firstRow.Inventory_Account || null;
      updateData.r365_cost_update_method = firstRow.Cost_Update_Method || null;
      updateData.r365_key_item = firstRow.Key_Item || false;

      const { error: updateError } = await supabase
        .from('items')
        .update(updateData)
        .eq('id', existingItem.id);

      if (updateError) {
        console.error(`  ❌ Failed to update item: ${updateError.message}`);
        errors++;
        continue;
      }

      // Delete existing pack configs
      await supabase
        .from('item_pack_configs')
        .delete()
        .eq('item_id', existingItem.id);

      // Add pack configs from Excel
      const packConfigMap = new Map<string, any>();

      for (const row of rows) {
        const packSize = row.PACK_SIZE?.trim();
        if (!packSize) continue;

        const packMatch = packSize.match(/^(\d+)\s*x\s*(\d+\.?\d*)(ml|l|oz)$/i);
        const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz)$/i);

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
            vendor_sku: row.SKU?.toString().trim() || null,
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
            vendor_sku: row.SKU?.toString().trim() || null,
          };
        }

        if (config && !packConfigMap.has(configKey)) {
          packConfigMap.set(configKey, config);
        }
      }

      const packConfigs = Array.from(packConfigMap.values());

      if (packConfigs.length > 0) {
        const { error: packError } = await supabase
          .from('item_pack_configs')
          .insert(packConfigs);

        if (packError) {
          console.error(`  ❌ Failed to add pack configs: ${packError.message}`);
          errors++;
        } else {
          console.log(`  ✓ Added ${packConfigs.length} pack config(s)`);
        }
      }

      updated++;
    } catch (error) {
      console.error(`❌ Error processing ${itemName}:`, error);
      errors++;
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`✅ Updated: ${updated}`);
  console.log(`⚠️  Not found in DB: ${notFound}`);
  console.log(`❌ Errors: ${errors}`);
}

migrateItemsFromExcel();
