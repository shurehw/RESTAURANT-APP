import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeMissingPackSizes() {
  // Read Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  const r365Items = new Map();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();
    if (sku) {
      r365Items.set(sku, packSize);
    }
  }

  // Get DB items and configs
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true);

  const { data: configs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  // Find R365 items without configs
  const missingPackSizes = new Map<string, number>();

  console.log('\n=== R365 Items Missing Pack Configs and Their Pack Sizes ===\n');

  for (const item of items || []) {
    if (r365Items.has(item.sku) && !itemsWithConfigs.has(item.id)) {
      const packSize = r365Items.get(item.sku);
      const count = missingPackSizes.get(packSize) || 0;
      missingPackSizes.set(packSize, count + 1);
      console.log(`${item.name.substring(0, 50).padEnd(52)} | "${packSize}"`);
    }
  }

  console.log('\n=== Pack Size Format Frequency ===\n');
  const sorted = Array.from(missingPackSizes.entries()).sort((a, b) => b[1] - a[1]);
  for (const [format, count] of sorted) {
    console.log(`${count.toString().padStart(3)} items: "${format}"`);
  }
}

analyzeMissingPackSizes().catch(console.error);
