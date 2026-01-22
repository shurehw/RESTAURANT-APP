import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillSubcategoriesBySku() {
  console.log('\n=== Backfilling Subcategories by SKU Match ===\n');

  // Load R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Create SKU to subcategory mapping (EXACT match only)
  const subcategoryBySku = new Map<string, string>();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const subcategory = String(row['SUBCATEGORY      '] || '').trim();
    if (sku && subcategory) {
      subcategoryBySku.set(sku, subcategory);
    }
  }

  console.log(`Loaded ${subcategoryBySku.size} subcategories from R365 Excel\n`);

  // Get items without subcategory
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, subcategory')
    .eq('is_active', true)
    .is('subcategory', null);

  console.log(`Found ${items?.length || 0} items without subcategory\n`);

  let updated = 0;
  let skipped = 0;

  for (const item of items || []) {
    const subcategory = subcategoryBySku.get(item.sku);

    if (subcategory) {
      const { error } = await supabase
        .from('items')
        .update({ subcategory })
        .eq('id', item.id);

      if (!error) {
        updated++;
        if (updated % 50 === 0) {
          console.log(`Updated ${updated} items...`);
        }
      }
    } else {
      skipped++;
    }
  }

  console.log(`\n✅ Updated ${updated} items with subcategories`);
  console.log(`⏭️  Skipped ${skipped} items (not found in R365 Excel)`);

  // Final stats
  const { data: finalItems } = await supabase
    .from('items')
    .select('subcategory')
    .eq('is_active', true);

  const totalItems = finalItems?.length || 0;
  const withSubcategory = finalItems?.filter(i => i.subcategory).length || 0;

  console.log(`\n📊 Final Subcategory Coverage: ${withSubcategory}/${totalItems} (${((withSubcategory/totalItems)*100).toFixed(1)}%)`);
}

backfillSubcategoriesBySku().catch(console.error);
