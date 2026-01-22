import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillR365Fields() {
  console.log('\n=== Backfilling Missing R365 Integration Fields ===\n');

  // Load R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Create map by SKU
  const r365BySku = new Map();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    if (sku && !r365BySku.has(sku)) {
      r365BySku.set(sku, {
        measureType: row['Measure Type'],
        reportingUom: row['Reporting U of M'],
        inventoryUom: row['Inventory U of M'],
        costAccount: row['Cost Account'],
        inventoryAccount: row['Inventory Account'],
        costUpdateMethod: row['Cost Update Method'],
        keyItem: row['Key Item'] || false
      });
    }
  }

  // Get all items
  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('is_active', true);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const item of items || []) {
    const r365Data = r365BySku.get(item.sku);

    if (!r365Data) {
      notFound++;
      continue;
    }

    // Check if already has all R365 fields
    if (item.r365_measure_type && item.r365_reporting_uom && item.r365_inventory_uom &&
        item.r365_cost_account && item.r365_inventory_account) {
      skipped++;
      continue;
    }

    // Update with R365 data
    const { error } = await supabase
      .from('items')
      .update({
        r365_measure_type: r365Data.measureType || null,
        r365_reporting_uom: r365Data.reportingUom || null,
        r365_inventory_uom: r365Data.inventoryUom || null,
        r365_cost_account: r365Data.costAccount || null,
        r365_inventory_account: r365Data.inventoryAccount || null,
        r365_cost_update_method: r365Data.costUpdateMethod || null,
        r365_key_item: r365Data.keyItem
      })
      .eq('id', item.id);

    if (!error) {
      updated++;
      if (updated <= 10 || updated % 50 === 0) {
        console.log(`${updated}. Updated: ${item.name.substring(0, 50)}`);
      }
    }
  }

  console.log(`\n✓ Updated: ${updated}`);
  console.log(`⊘ Skipped (already complete): ${skipped}`);
  console.log(`⚠ Not Found in R365: ${notFound}`);
  console.log(`📊 Total: ${items?.length || 0}`);
}

backfillR365Fields().catch(console.error);
