import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function completeR365Backfill() {
  console.log('\n=== Complete R365 Field Backfill ===\n');

  // Load R365 Excel for reference
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Create SKU lookup
  const r365BySku = new Map<string, any>();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    if (sku) {
      r365BySku.set(sku, {
        subcategory: String(row['SUBCATEGORY      '] || '').trim(),
        measureType: String(row['Measure Type'] || 'Weight').trim(),
        reportingUom: String(row['Reporting UOM'] || '').trim(),
        inventoryUom: String(row['Inventory UOM'] || '').trim(),
        costAccount: String(row['Cost Account'] || '').trim(),
        inventoryAccount: String(row['Inventory Account'] || '').trim(),
        costUpdateMethod: String(row['Cost Update Method'] || 'Average').trim(),
        keyItem: String(row['Key Item'] || 'FALSE').toUpperCase() === 'TRUE'
      });
    }
  }

  console.log(`Loaded ${r365BySku.size} items from R365 Excel\n`);

  // Get all active items
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, category, base_uom, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, r365_cost_update_method, r365_key_item')
    .eq('is_active', true);

  let updated = 0;
  let errors = 0;

  for (const item of items || []) {
    const r365Data = r365BySku.get(item.sku);

    const updateData: any = {};
    let needsUpdate = false;

    // 1. MEASURE TYPE - Critical field, default to "Weight" if missing
    if (!item.r365_measure_type) {
      updateData.r365_measure_type = r365Data?.measureType || 'Weight';
      needsUpdate = true;
    }

    // 2. REPORTING UOM - Use R365 data or infer from category
    if (!item.r365_reporting_uom) {
      if (r365Data?.reportingUom) {
        updateData.r365_reporting_uom = r365Data.reportingUom;
      } else {
        // Infer from category
        updateData.r365_reporting_uom = inferReportingUom(item.category, item.base_uom);
      }
      needsUpdate = true;
    }

    // 3. INVENTORY UOM - Use R365 data or same as reporting UOM
    if (!item.r365_inventory_uom) {
      if (r365Data?.inventoryUom) {
        updateData.r365_inventory_uom = r365Data.inventoryUom;
      } else {
        updateData.r365_inventory_uom = updateData.r365_reporting_uom || item.r365_reporting_uom || item.base_uom;
      }
      needsUpdate = true;
    }

    // 4. COST ACCOUNT - Use R365 data or derive from category
    if (!item.r365_cost_account) {
      updateData.r365_cost_account = r365Data?.costAccount || deriveCostAccount(item.category);
      needsUpdate = true;
    }

    // 5. INVENTORY ACCOUNT - Use R365 data or default
    if (!item.r365_inventory_account) {
      updateData.r365_inventory_account = r365Data?.inventoryAccount || '1210';
      needsUpdate = true;
    }

    // 6. COST UPDATE METHOD - Use R365 data or default to "Average"
    if (!item.r365_cost_update_method) {
      updateData.r365_cost_update_method = r365Data?.costUpdateMethod || 'Average';
      needsUpdate = true;
    }

    // 7. KEY ITEM - Use R365 data or default to false
    if (item.r365_key_item === null || item.r365_key_item === undefined) {
      updateData.r365_key_item = r365Data?.keyItem || false;
      needsUpdate = true;
    }

    if (needsUpdate) {
      const { error } = await supabase
        .from('items')
        .update(updateData)
        .eq('id', item.id);

      if (!error) {
        updated++;
        if (updated % 100 === 0) {
          console.log(`Updated ${updated} items...`);
        }
      } else {
        errors++;
        if (errors <= 5) {
          console.error(`Error updating ${item.name}:`, error.message);
        }
      }
    }
  }

  console.log(`\n✅ Updated ${updated} items with R365 fields`);
  if (errors > 0) {
    console.log(`❌ ${errors} errors occurred`);
  }

  // Summary
  const { data: finalItems } = await supabase
    .from('items')
    .select('r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account, r365_cost_update_method')
    .eq('is_active', true);

  const totalItems = finalItems?.length || 0;
  const withMeasureType = finalItems?.filter(i => i.r365_measure_type).length || 0;
  const withReportingUom = finalItems?.filter(i => i.r365_reporting_uom).length || 0;
  const withInventoryUom = finalItems?.filter(i => i.r365_inventory_uom).length || 0;
  const withCostAccount = finalItems?.filter(i => i.r365_cost_account).length || 0;

  console.log('\n📊 Final Coverage:');
  console.log(`  Measure Type: ${withMeasureType}/${totalItems} (${((withMeasureType/totalItems)*100).toFixed(1)}%)`);
  console.log(`  Reporting UOM: ${withReportingUom}/${totalItems} (${((withReportingUom/totalItems)*100).toFixed(1)}%)`);
  console.log(`  Inventory UOM: ${withInventoryUom}/${totalItems} (${((withInventoryUom/totalItems)*100).toFixed(1)}%)`);
  console.log(`  Cost Account: ${withCostAccount}/${totalItems} (${((withCostAccount/totalItems)*100).toFixed(1)}%)`);
}

function inferReportingUom(category: string, baseUom: string): string {
  // Infer R365 reporting UOM from category
  const categoryUomMap: Record<string, string> = {
    'liquor': 'L',
    'wine': 'L',
    'beer': 'L',
    'beverage': 'L',
    'non_alcoholic_beverage': 'L',
    'bar_consumables': 'Each',
    'food': 'LB',
    'packaging': 'Each'
  };

  return categoryUomMap[category] || baseUom || 'Each';
}

function deriveCostAccount(category: string): string {
  // Derive cost account from category
  const categoryAccountMap: Record<string, string> = {
    'liquor': '5310',
    'wine': '5320',
    'beer': '5330',
    'beverage': '5330',
    'non_alcoholic_beverage': '5335',
    'bar_consumables': '5315',
    'food': '5100',
    'packaging': '5400'
  };

  return categoryAccountMap[category] || '5000';
}

completeR365Backfill().catch(console.error);
