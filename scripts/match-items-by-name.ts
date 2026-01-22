import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function matchByName() {
  console.log('\n=== Matching Items by Name Instead of SKU ===\n');

  // Read Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Create map by normalized name
  const r365ByName = new Map();
  for (const row of excelData as any[]) {
    const name = String(row['ITEM      '] || '').trim();
    const sku = String(row['SKU      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();
    if (name) {
      r365ByName.set(name.toLowerCase(), { name, sku, packSize });
    }
  }

  // Get items without configs
  const { data: items } = await supabase.from('items').select('id, name, sku').eq('is_active', true);
  const { data: configs } = await supabase.from('item_pack_configurations').select('item_id');
  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  console.log('Items in DB missing pack configs that ARE in R365 Excel:\n');

  let found = 0;
  let added = 0;
  let failed = 0;

  for (const item of items || []) {
    if (itemsWithConfigs.has(item.id)) continue;

    const normalized = item.name.toLowerCase();
    const r365Item = r365ByName.get(normalized);

    if (r365Item) {
      found++;
      console.log(`${found}. DB: "${item.name}" (SKU: ${item.sku})`);
      console.log(`   R365: "${r365Item.name}" (SKU: ${r365Item.sku}) | Pack: "${r365Item.packSize}"`);

      // Check if SKUs match
      if (item.sku !== r365Item.sku) {
        console.log(`   ⚠️  SKU MISMATCH!`);
      }

      // Try to add pack config
      const packSize = r365Item.packSize;
      const packMatch = packSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);
      const singleMatch = packSize.match(/^(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);

      if (packMatch) {
        const config = {
          item_id: item.id,
          pack_type: 'case',
          units_per_pack: parseFloat(packMatch[1]),
          unit_size: parseFloat(packMatch[2]),
          unit_size_uom: packMatch[3].toLowerCase(),
          conversion_factor: parseFloat(packMatch[1]) * parseFloat(packMatch[2]),
          vendor_item_code: r365Item.sku
        };

        const { error } = await supabase.from('item_pack_configurations').insert(config);
        if (error) {
          console.log(`   ✗ Error: ${error.message}`);
          failed++;
        } else {
          console.log(`   ✓ Added pack config`);
          added++;
        }
      } else if (singleMatch) {
        const config = {
          item_id: item.id,
          pack_type: 'bottle',
          units_per_pack: 1,
          unit_size: parseFloat(singleMatch[1]),
          unit_size_uom: singleMatch[2].toLowerCase(),
          conversion_factor: parseFloat(singleMatch[1]),
          vendor_item_code: r365Item.sku
        };

        const { error } = await supabase.from('item_pack_configurations').insert(config);
        if (error) {
          console.log(`   ✗ Error: ${error.message}`);
          failed++;
        } else {
          console.log(`   ✓ Added pack config`);
          added++;
        }
      } else {
        console.log(`   ⚠️  Pack size format not matched`);
        failed++;
      }

      console.log('');
    }
  }

  console.log(`\n✓ Found: ${found}`);
  console.log(`✓ Added: ${added}`);
  console.log(`✗ Failed: ${failed}`);
}

matchByName().catch(console.error);
