import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeRemaining() {
  // Read Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  const r365Data = new Map();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();
    const name = String(row['ITEM      '] || '').trim();
    if (sku) {
      r365Data.set(sku, { packSize, name });
    }
  }

  // Get items without configs
  const { data: items } = await supabase.from('items').select('id, name, sku').eq('is_active', true);
  const { data: configs } = await supabase.from('item_pack_configurations').select('item_id');
  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  console.log('\n=== 49 R365 Items Without Pack Configs ===\n');

  const packSizeFormats = new Map<string, number>();
  let count = 0;

  for (const item of items || []) {
    if (!r365Data.has(item.sku) || itemsWithConfigs.has(item.id)) continue;

    const { packSize, name: excelName } = r365Data.get(item.sku);
    count++;

    const formatCount = packSizeFormats.get(packSize) || 0;
    packSizeFormats.set(packSize, formatCount + 1);

    console.log(`${count}. ${item.name.substring(0, 45).padEnd(47)} | "${packSize}"`);
  }

  console.log('\n=== Pack Size Format Frequency ===\n');
  const sorted = Array.from(packSizeFormats.entries()).sort((a, b) => b[1] - a[1]);
  for (const [format, cnt] of sorted) {
    console.log(`${cnt.toString().padStart(3)} items: "${format}"`);
  }

  console.log(`\nTotal missing: ${count}`);
}

analyzeRemaining().catch(console.error);
