import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function backfillData() {
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

  // Get user's organization to find GL accounts
  const { data: user } = await supabase.auth.getUser();
  const { data: orgUsers } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('is_active', true)
    .limit(1);

  const orgId = orgUsers?.[0]?.organization_id;

  // Get GL accounts for this org
  const { data: glAccounts } = await supabase
    .from('gl_accounts')
    .select('id, external_code, name, section')
    .eq('org_id', orgId)
    .eq('is_active', true);

  console.log(`Found ${glAccounts?.length || 0} GL accounts\n`);

  let updated = 0;
  let errors = 0;

  for (const [itemName, rows] of itemGroups.entries()) {
    const firstRow = rows[0];

    // Find existing item
    const { data: existingItems } = await supabase
      .from('items')
      .select('id, name, category, subcategory, gl_account_id')
      .ilike('name', itemName)
      .limit(1);

    if (!existingItems || existingItems.length === 0) {
      continue;
    }

    const existingItem = existingItems[0];
    const needsUpdate: any = {};

    // Determine category and subcategory from Excel "Item Category 1"
    const excelCategory = firstRow.Item_Category_1?.toString().toLowerCase();
    const excelSubcategory = firstRow.SUBCATEGORY?.trim();

    // Map Wine items correctly
    if (excelCategory === 'wine' || itemName.toLowerCase().includes('wine') ||
        itemName.toLowerCase().includes('cabernet') || itemName.toLowerCase().includes('chardonnay') ||
        itemName.toLowerCase().includes('pinot') || itemName.toLowerCase().includes('champagne') ||
        itemName.toLowerCase().includes('prosecco')) {
      needsUpdate.category = 'wine';
    }

    // If subcategory is missing, add it
    if (!existingItem.subcategory && excelSubcategory) {
      needsUpdate.subcategory = excelSubcategory;
    }

    // If GL account is missing, try to assign one
    if (!existingItem.gl_account_id && glAccounts && glAccounts.length > 0) {
      // Find appropriate GL account based on category
      let targetGL = glAccounts.find(gl =>
        gl.section === 'COGS' &&
        (gl.name.toLowerCase().includes('liquor') || gl.name.toLowerCase().includes('beverage'))
      );

      // For wine, look for wine-specific GL
      if (needsUpdate.category === 'wine' || existingItem.category === 'wine') {
        const wineGL = glAccounts.find(gl =>
          gl.section === 'COGS' && gl.name.toLowerCase().includes('wine')
        );
        if (wineGL) targetGL = wineGL;
      }

      if (targetGL) {
        needsUpdate.gl_account_id = targetGL.id;
      }
    }

    // Update if there are changes
    if (Object.keys(needsUpdate).length > 0) {
      const { error } = await supabase
        .from('items')
        .update(needsUpdate)
        .eq('id', existingItem.id);

      if (error) {
        console.error(`❌ Failed to update ${itemName}:`, error.message);
        errors++;
      } else {
        const changes = Object.keys(needsUpdate).join(', ');
        console.log(`✓ ${itemName}: Updated ${changes}`);
        updated++;
      }
    }

    if ((updated + errors) % 100 === 0) {
      console.log(`\nProgress: ${updated} updated, ${errors} errors\n`);
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`✅ Updated: ${updated}`);
  console.log(`❌ Errors: ${errors}`);
}

backfillData();
