import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixMissingCategories() {
  console.log('\n=== Backfilling Missing Categories from R365 ===\n');

  // Load R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Create SKU to category mapping from Excel
  const r365CategoryBySku = new Map<string, { category: string; subcategory: string }>();

  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const r365Category = String(row['Item Category 1'] || '').trim();
    const r365Subcategory = String(row['SUBCATEGORY      '] || '').trim();

    if (!sku) continue;

    // Map R365 GL categories to our system categories
    let category = '';
    if (r365Category.includes('5310')) {
      category = 'liquor';
    } else if (r365Category.includes('5320')) {
      category = 'wine';
    } else if (r365Category.includes('5330')) {
      category = 'beer'; // Change from 'beverage' to 'beer'
    } else if (r365Category.includes('5335')) {
      category = 'non_alcoholic_beverage';
    } else if (r365Category.includes('5315')) {
      category = 'bar_consumables';
    }

    if (category) {
      r365CategoryBySku.set(sku, {
        category,
        subcategory: r365Subcategory || null
      });
    }
  }

  console.log(`Loaded ${r365CategoryBySku.size} category mappings from R365\n`);

  // Get all items
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, category, subcategory')
    .eq('is_active', true);

  let updated = 0;
  let alreadyHadCategory = 0;

  for (const item of items || []) {
    const r365Data = r365CategoryBySku.get(item.sku);

    if (!r365Data) continue;

    // Update if missing category or subcategory
    const needsUpdate = !item.category || !item.subcategory;

    if (needsUpdate) {
      const updateData: any = {};

      if (!item.category) {
        updateData.category = r365Data.category;
      }

      if (!item.subcategory && r365Data.subcategory) {
        updateData.subcategory = r365Data.subcategory;
      }

      if (Object.keys(updateData).length > 0) {
        const { error } = await supabase
          .from('items')
          .update(updateData)
          .eq('id', item.id);

        if (!error) {
          updated++;
          if (updated % 50 === 0) {
            console.log(`Updated ${updated} items...`);
          }
        } else {
          console.error(`Error updating ${item.name}:`, error.message);
        }
      }
    } else {
      alreadyHadCategory++;
    }
  }

  console.log(`\n✅ Updated ${updated} items with categories from R365`);
  console.log(`Already had categories: ${alreadyHadCategory}`);

  // Summary stats
  const categoryStats = new Map<string, number>();
  const { data: updatedItems } = await supabase
    .from('items')
    .select('category')
    .eq('is_active', true);

  for (const item of updatedItems || []) {
    if (item.category) {
      categoryStats.set(item.category, (categoryStats.get(item.category) || 0) + 1);
    }
  }

  console.log('\n📊 Updated Category Distribution:');
  Array.from(categoryStats.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat.padEnd(30)} ${count.toString().padStart(4)} items`);
    });
}

fixMissingCategories().catch(console.error);
