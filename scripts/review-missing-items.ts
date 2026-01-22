import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function reviewMissing() {
  console.log('\n=== Reviewing Missing Pack Configs ===\n');

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

  console.log('Items missing pack configs that are in R365 Excel:\n');

  const missing: any[] = [];

  for (const item of items || []) {
    if (itemsWithConfigs.has(item.id)) continue;

    const r365Item = r365ByName.get(item.name.toLowerCase());
    if (r365Item) {
      missing.push({
        dbName: item.name,
        dbSku: item.sku,
        r365Name: r365Item.name,
        r365Sku: r365Item.sku,
        packSize: r365Item.packSize
      });
    }
  }

  missing.forEach((m, i) => {
    console.log(`${i + 1}. ${m.dbName}`);
    console.log(`   DB SKU: ${m.dbSku}`);
    console.log(`   R365 SKU: ${m.r365Sku}`);
    console.log(`   Pack Size: "${m.packSize}"`);

    // Test if pack size matches our regex
    const packMatch = m.packSize.match(/^(\d+\.?\d*)\s*x\s*(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);
    const singleMatch = m.packSize.match(/^(\d+\.?\d*)(ml|l|oz|fl\.oz|gal|lb|kg|g|each|case|pack|quart)$/i);

    if (!packMatch && !singleMatch) {
      console.log(`   ❌ REGEX DOES NOT MATCH`);

      // Try to suggest fix
      if (m.packSize.includes('(')) {
        console.log(`   💡 Contains parentheses - needs special handling`);
      }
    } else {
      console.log(`   ✅ Regex matches - should have been added`);
    }
    console.log('');
  });

  console.log(`Total missing R365 items: ${missing.length}`);
}

reviewMissing().catch(console.error);
