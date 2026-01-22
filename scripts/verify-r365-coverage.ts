import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyR365Coverage() {
  console.log('\n=== Verifying R365 Pack Config Coverage ===\n');

  // Read the R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  console.log(`Total rows in R365 Excel: ${excelData.length}`);

  // Get unique items from Excel (by SKU)
  const uniqueR365Items = new Map();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const name = String(row['ITEM      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();

    if (sku && !uniqueR365Items.has(sku)) {
      uniqueR365Items.set(sku, { name, packSize });
    }
  }

  console.log(`Unique R365 items (by Item_Code): ${uniqueR365Items.size}`);

  // Get all items with pack configs from database
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku')
    .eq('is_active', true);

  const { data: configs } = await supabase
    .from('item_pack_configurations')
    .select('item_id');

  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);

  // Check how many R365 items are in our system and have pack configs
  let r365ItemsInDb = 0;
  let r365ItemsWithConfigs = 0;
  let r365ItemsMissingConfigs: string[] = [];

  for (const item of items || []) {
    if (uniqueR365Items.has(item.sku)) {
      r365ItemsInDb++;
      if (itemsWithConfigs.has(item.id)) {
        r365ItemsWithConfigs++;
      } else {
        r365ItemsMissingConfigs.push(`${item.name} (${item.sku})`);
      }
    }
  }

  console.log(`\nR365 items in database: ${r365ItemsInDb}`);
  console.log(`R365 items WITH pack configs: ${r365ItemsWithConfigs}`);
  console.log(`R365 items WITHOUT pack configs: ${r365ItemsMissingConfigs.length}`);

  if (r365ItemsMissingConfigs.length > 0) {
    console.log('\nR365 items missing pack configs:');
    r365ItemsMissingConfigs.forEach(item => console.log(`- ${item}`));
  }

  const coverage = r365ItemsInDb > 0
    ? ((r365ItemsWithConfigs / r365ItemsInDb) * 100).toFixed(1)
    : '0';

  console.log(`\n✓ R365 Pack Config Coverage: ${coverage}%`);

  // Non-R365 items
  const nonR365Items = items?.filter(i => !uniqueR365Items.has(i.sku)) || [];
  const nonR365WithConfigs = nonR365Items.filter(i => itemsWithConfigs.has(i.id));

  console.log(`\nNon-R365 items in database: ${nonR365Items.length}`);
  console.log(`Non-R365 items with pack configs: ${nonR365WithConfigs.length}`);
}

verifyR365Coverage().catch(console.error);
