import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addFinalMissing() {
  console.log('\n=== Adding Final Missing Pack Configs ===\n');

  // Read Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  const r365ByName = new Map();
  for (const row of excelData as any[]) {
    const name = String(row['ITEM      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();
    const sku = String(row['SKU      '] || '').trim();
    if (name) {
      r365ByName.set(name.toLowerCase(), { name, sku, packSize });
    }
  }

  // Get items without configs
  const { data: items } = await supabase.from('items').select('id, name, sku').eq('is_active', true);
  const { data: configs } = await supabase.from('item_pack_configurations').select('item_id');
  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  let added = 0;
  let skipped = 0;

  for (const item of items || []) {
    if (itemsWithConfigs.has(item.id)) continue;

    const r365Item = r365ByName.get(item.name.toLowerCase());
    if (!r365Item || !r365Item.packSize) {
      skipped++;
      continue;
    }

    const packSize = r365Item.packSize;

    // Updated regex to handle parentheses in units like "1(LB)"
    const packMatch = packSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(\(?\w+\.?\w*\)?)$/i);
    const singleMatch = packSize.match(/^(\d+\.?\d*)(\(?\w+\.?\w*\)?)$/i);

    let config: any = null;

    if (packMatch) {
      const unitsPerPack = parseFloat(packMatch[1]);
      const unitSize = parseFloat(packMatch[2]);
      let unitSizeUom = packMatch[3].toLowerCase();

      // Remove parentheses from unit
      unitSizeUom = unitSizeUom.replace(/[()]/g, '');

      config = {
        item_id: item.id,
        pack_type: 'case',
        units_per_pack: unitsPerPack,
        unit_size: unitSize,
        unit_size_uom: unitSizeUom,
        conversion_factor: unitsPerPack * unitSize,
        vendor_item_code: r365Item.sku
      };
    } else if (singleMatch) {
      const unitSize = parseFloat(singleMatch[1]);
      let unitSizeUom = singleMatch[2].toLowerCase();

      // Remove parentheses from unit
      unitSizeUom = unitSizeUom.replace(/[()]/g, '');

      config = {
        item_id: item.id,
        pack_type: 'bottle',
        units_per_pack: 1,
        unit_size: unitSize,
        unit_size_uom: unitSizeUom,
        conversion_factor: unitSize,
        vendor_item_code: r365Item.sku
      };
    }

    if (config) {
      const { error } = await supabase.from('item_pack_configurations').insert(config);
      if (!error) {
        added++;
        if (added <= 10 || added % 10 === 0) {
          console.log(`${added}. Added: ${item.name} | "${packSize}"`);
        }
      }
    } else {
      skipped++;
    }
  }

  console.log(`\n✓ Added: ${added}`);
  console.log(`⊘ Skipped: ${skipped}`);

  // Final count
  const { count } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true });

  console.log(`\nFinal pack config count: ${count}`);
}

addFinalMissing().catch(console.error);
