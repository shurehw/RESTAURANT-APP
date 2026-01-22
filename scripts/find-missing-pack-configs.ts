import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findMissingPackConfigs() {
  console.log('\n=== Finding Items Without Pack Configs ===\n');

  // Get all items
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true)
    .order('name');

  // Get all pack configs
  const { data: configs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);
  const itemsWithout = items?.filter(i => !itemsWithConfigs.has(i.id)) || [];

  console.log(`Total items: ${items?.length || 0}`);
  console.log(`Items with pack configs: ${itemsWithConfigs.size}`);
  console.log(`Items WITHOUT pack configs: ${itemsWithout.length}`);

  // Read the original Excel to find their pack sizes
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log('\n=== Items Without Pack Configs and Their Original Pack Sizes ===\n');

  const packSizeFormats = new Map<string, number>();

  for (const item of itemsWithout) {
    // Try to find this item in the Excel by SKU or name
    const excelRow = data.find((row: any) => {
      const rowSku = row.Item_Code || row.SKU || '';
      const rowName = row.Item_Name || row.Name || '';
      return rowSku === item.sku || rowName.includes(item.name.substring(0, 20));
    }) as any;

    if (excelRow) {
      const packSize = excelRow.Pack_Size || excelRow['Pack Size'] || '';
      if (packSize) {
        const count = packSizeFormats.get(packSize) || 0;
        packSizeFormats.set(packSize, count + 1);
        console.log(`${item.name.substring(0, 50).padEnd(50)} | Pack Size: "${packSize}"`);
      } else {
        console.log(`${item.name.substring(0, 50).padEnd(50)} | NO PACK SIZE IN EXCEL`);
      }
    } else {
      console.log(`${item.name.substring(0, 50).padEnd(50)} | NOT FOUND IN EXCEL`);
    }
  }

  console.log('\n=== Unparsed Pack Size Format Frequency ===\n');
  const sortedFormats = Array.from(packSizeFormats.entries())
    .sort((a, b) => b[1] - a[1]);

  for (const [format, count] of sortedFormats) {
    console.log(`${count.toString().padStart(3)} items: "${format}"`);
  }
}

findMissingPackConfigs().catch(console.error);
