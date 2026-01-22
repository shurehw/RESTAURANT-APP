import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addMissingPackConfigs() {
  console.log('\n=== Adding Pack Configs for 54 Missing R365 Items ===\n');

  // Read Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  const r365Data = new Map();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();
    if (sku) {
      r365Data.set(sku, packSize);
    }
  }

  // Get items and configs
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true);

  const { data: configs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  let added = 0;
  let failed = 0;

  for (const item of items || []) {
    // Skip if already has config or not an R365 item
    if (itemsWithConfigs.has(item.id) || !r365Data.has(item.sku)) {
      continue;
    }

    const packSize = r365Data.get(item.sku);
    if (!packSize) continue;

    // Parse pack size
    const packMatch = packSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);
    const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);

    let config: any = null;

    if (packMatch) {
      const unitsPerPack = parseFloat(packMatch[1]);
      const unitSize = parseFloat(packMatch[2]);
      const unitSizeUom = packMatch[3].toLowerCase();

      config = {
        item_id: item.id,
        pack_type: 'case',
        units_per_pack: unitsPerPack,
        unit_size: unitSize,
        unit_size_uom: unitSizeUom,
        conversion_factor: unitsPerPack * unitSize, // simplified - assumes same unit
        vendor_item_code: item.sku
      };
    } else if (singleMatch) {
      const unitSize = parseFloat(singleMatch[1]);
      const unitSizeUom = singleMatch[2].toLowerCase();

      config = {
        item_id: item.id,
        pack_type: 'bottle',
        units_per_pack: 1,
        unit_size: unitSize,
        unit_size_uom: unitSizeUom,
        conversion_factor: unitSize, // simplified - assumes same unit
        vendor_item_code: item.sku
      };
    }

    if (config) {
      const { error } = await supabase
        .from('item_pack_configurations')
        .insert(config);

      if (error) {
        console.log(`✗ ${item.name.substring(0, 50)} | "${packSize}" | Error: ${error.message}`);
        failed++;
      } else {
        console.log(`✓ ${item.name.substring(0, 50)} | "${packSize}"`);
        added++;
      }
    } else {
      console.log(`⚠ ${item.name.substring(0, 50)} | "${packSize}" | NO REGEX MATCH`);
      failed++;
    }
  }

  console.log(`\n✓ Added: ${added}`);
  console.log(`✗ Failed: ${failed}`);
}

addMissingPackConfigs().catch(console.error);
