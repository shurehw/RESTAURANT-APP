import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Map R365 GL account codes to our categories
function mapR365CategoryToOurs(r365Category: string): string {
  if (!r365Category) return 'liquor';

  const lower = r365Category.toLowerCase();

  if (lower.includes('5320') || lower.includes('wine')) return 'wine';
  if (lower.includes('5330') || lower.includes('beer')) return 'beverage';
  if (lower.includes('5335') || lower.includes('n/a beverage')) return 'non_alcoholic_beverage';
  if (lower.includes('5315') || lower.includes('bar consumables')) return 'bar_consumables';
  if (lower.includes('5310') || lower.includes('liquor')) return 'liquor';

  return 'liquor'; // default
}

async function fixCategories() {
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  // Normalize column names
  const normalized = jsonData.map((row: any) => {
    const normalizedRow: any = {};
    for (const key in row) {
      const cleanKey = key.trim().replace(/\s+/g, '_');
      normalizedRow[cleanKey] = row[key];
    }
    return normalizedRow;
  });

  console.log(`Loaded ${normalized.length} rows from Excel\n`);

  // Group by item name
  const itemGroups = new Map<string, any[]>();
  for (const row of normalized) {
    const name = row.ITEM?.trim();
    if (!name) continue;

    if (!itemGroups.has(name)) {
      itemGroups.set(name, []);
    }
    itemGroups.get(name)!.push(row);
  }

  let updated = 0;
  let errors = 0;

  for (const [itemName, rows] of itemGroups.entries()) {
    const firstRow = rows[0];

    // Find existing item
    const { data: existingItems } = await supabase
      .from('items')
      .select('id, name, category, subcategory')
      .ilike('name', itemName)
      .limit(1);

    if (!existingItems || existingItems.length === 0) {
      continue;
    }

    const existingItem = existingItems[0];
    const r365Category = firstRow.Item_Category_1;
    const subcategory = firstRow.SUBCATEGORY?.trim();

    const correctCategory = mapR365CategoryToOurs(r365Category);

    const needsUpdate: any = {};

    // Update category if different
    if (existingItem.category !== correctCategory) {
      needsUpdate.category = correctCategory;
    }

    // Update subcategory if missing
    if (!existingItem.subcategory && subcategory) {
      needsUpdate.subcategory = subcategory;
    }

    if (Object.keys(needsUpdate).length > 0) {
      const { error } = await supabase
        .from('items')
        .update(needsUpdate)
        .eq('id', existingItem.id);

      if (error) {
        console.error(`❌ ${itemName}:`, error.message);
        errors++;
      } else {
        console.log(`✓ ${itemName}: ${existingItem.category} → ${correctCategory}`);
        updated++;
      }
    }

    if ((updated + errors) % 100 === 0 && (updated + errors) > 0) {
      console.log(`\nProgress: ${updated} updated, ${errors} errors\n`);
    }
  }

  console.log('\n=== Category Fix Complete ===');
  console.log(`✅ Updated: ${updated}`);
  console.log(`❌ Errors: ${errors}`);
}

fixCategories();
