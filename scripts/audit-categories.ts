import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function auditCategories() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('           CATEGORY AUDIT: R365 vs DATABASE MAPPING            ');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Load R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Get database items
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, name, sku, category, subcategory')
    .eq('is_active', true);

  console.log('📊 SECTION 1: R365 CATEGORY DISTRIBUTION\n');

  // Analyze R365 categories
  const r365Categories = new Map<string, number>();
  const r365Subcategories = new Map<string, number>();
  const r365BySku = new Map<string, any>();

  for (const row of excelData as any[]) {
    const category = String(row['Item Category 1'] || '').trim();
    const subcategory = String(row['SUBCATEGORY      '] || '').trim();
    const sku = String(row['SKU      '] || '').trim();
    const name = String(row['ITEM      '] || '').trim();

    if (category) {
      r365Categories.set(category, (r365Categories.get(category) || 0) + 1);
    }
    if (subcategory) {
      r365Subcategories.set(subcategory, (r365Subcategories.get(subcategory) || 0) + 1);
    }

    if (sku) {
      r365BySku.set(sku, { name, category, subcategory });
    }
  }

  console.log('R365 Category Distribution:');
  const sortedR365Cats = Array.from(r365Categories.entries()).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedR365Cats) {
    console.log(`  ${cat.padEnd(35)} ${count.toString().padStart(4)} items`);
  }

  console.log('\nR365 Subcategory Distribution (Top 20):');
  const sortedR365Subs = Array.from(r365Subcategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [sub, count] of sortedR365Subs) {
    console.log(`  ${sub.padEnd(30)} ${count.toString().padStart(4)} items`);
  }

  console.log('\n\n📊 SECTION 2: DATABASE CATEGORY DISTRIBUTION\n');

  // Analyze DB categories
  const dbCategories = new Map<string, number>();
  const dbSubcategories = new Map<string, number>();

  for (const item of dbItems || []) {
    if (item.category) {
      dbCategories.set(item.category, (dbCategories.get(item.category) || 0) + 1);
    }
    if (item.subcategory) {
      dbSubcategories.set(item.subcategory, (dbSubcategories.get(item.subcategory) || 0) + 1);
    }
  }

  console.log('Database Category Distribution:');
  const sortedDbCats = Array.from(dbCategories.entries()).sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sortedDbCats) {
    console.log(`  ${cat.padEnd(30)} ${count.toString().padStart(4)} items`);
  }

  console.log('\nDatabase Subcategory Distribution (Top 20):');
  const sortedDbSubs = Array.from(dbSubcategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [sub, count] of sortedDbSubs) {
    console.log(`  ${(sub || 'NULL').padEnd(30)} ${count.toString().padStart(4)} items`);
  }

  console.log('\n\n📊 SECTION 3: CATEGORY MAPPING ANALYSIS\n');

  // Analyze mapping between R365 and DB
  const r365ToDbMapping = new Map<string, Map<string, number>>();
  const mismatches: any[] = [];

  for (const item of dbItems || []) {
    const r365Data = r365BySku.get(item.sku);
    if (r365Data) {
      if (!r365ToDbMapping.has(r365Data.category)) {
        r365ToDbMapping.set(r365Data.category, new Map());
      }
      const dbCatMap = r365ToDbMapping.get(r365Data.category)!;
      dbCatMap.set(item.category, (dbCatMap.get(item.category) || 0) + 1);

      // Check for mismatches
      if (r365Data.category && item.category) {
        const r365Cat = r365Data.category.toLowerCase();
        const dbCat = item.category.toLowerCase();

        // Expected mappings
        const expectedMappings: Record<string, string[]> = {
          '5310 - liquor cost': ['liquor'],
          '5320 - wine cost': ['wine'],
          '5330 - beer cost': ['beverage', 'beer'],
          '5335 - n/a beverage cost': ['non_alcoholic_beverage'],
          '5315 - bar consumables cost': ['bar_consumables']
        };

        let isValidMapping = false;
        for (const [r365Key, dbValues] of Object.entries(expectedMappings)) {
          if (r365Cat.includes(r365Key.toLowerCase())) {
            if (dbValues.includes(dbCat)) {
              isValidMapping = true;
              break;
            }
          }
        }

        if (!isValidMapping && r365Data.category !== '') {
          mismatches.push({
            item: item.name,
            sku: item.sku,
            r365Category: r365Data.category,
            dbCategory: item.category,
            r365Subcategory: r365Data.subcategory,
            dbSubcategory: item.subcategory
          });
        }
      }
    }
  }

  console.log('R365 Category → Database Category Mapping:\n');
  for (const [r365Cat, dbCatMap] of r365ToDbMapping.entries()) {
    console.log(`R365: "${r365Cat}"`);
    for (const [dbCat, count] of Array.from(dbCatMap.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`  → ${dbCat.padEnd(25)} ${count.toString().padStart(4)} items`);
    }
    console.log('');
  }

  console.log('\n📊 SECTION 4: CATEGORY MISMATCHES\n');

  if (mismatches.length > 0) {
    console.log(`Found ${mismatches.length} potential category mismatches:\n`);
    mismatches.slice(0, 20).forEach((m, i) => {
      console.log(`${i + 1}. ${m.item.substring(0, 40)}`);
      console.log(`   SKU: ${m.sku}`);
      console.log(`   R365: ${m.r365Category} / ${m.r365Subcategory || 'N/A'}`);
      console.log(`   DB:   ${m.dbCategory} / ${m.dbSubcategory || 'N/A'}`);
      console.log('');
    });

    if (mismatches.length > 20) {
      console.log(`   ... and ${mismatches.length - 20} more\n`);
    }
  } else {
    console.log('✅ No category mismatches found!\n');
  }

  console.log('\n📊 SECTION 5: GL ACCOUNT VERIFICATION\n');

  // Check if items have GL accounts assigned
  const { data: itemsWithGL } = await supabase
    .from('items')
    .select('id, name, category, gl_account_id')
    .eq('is_active', true);

  let withGL = 0;
  let withoutGL = 0;
  const categoriesWithoutGL = new Map<string, number>();

  for (const item of itemsWithGL || []) {
    if (item.gl_account_id) {
      withGL++;
    } else {
      withoutGL++;
      if (item.category) {
        categoriesWithoutGL.set(item.category, (categoriesWithoutGL.get(item.category) || 0) + 1);
      }
    }
  }

  console.log(`Items WITH GL Account: ${withGL} (${((withGL / (itemsWithGL?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`Items WITHOUT GL Account: ${withoutGL} (${((withoutGL / (itemsWithGL?.length || 1)) * 100).toFixed(1)}%)`);

  if (withoutGL > 0) {
    console.log('\nCategories missing GL accounts:');
    Array.from(categoriesWithoutGL.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat.padEnd(30)} ${count.toString().padStart(4)} items`);
      });
  }

  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('                    CATEGORY AUDIT SUMMARY                     ');
  console.log('══════════════════════════════════════════════════════════════\n');

  console.log('R365 Categories in Excel:', r365Categories.size);
  console.log('Database Categories:', dbCategories.size);
  console.log('Category Mismatches:', mismatches.length);
  console.log('Items without GL Account:', withoutGL);

  const categoryScore = Math.max(0, 100 - (mismatches.length * 2) - (withoutGL > 50 ? 20 : 0));
  console.log(`\n✅ CATEGORY QUALITY SCORE: ${categoryScore}/100`);

  if (categoryScore >= 90) {
    console.log('   Status: EXCELLENT - Categories properly mapped ✓');
  } else if (categoryScore >= 75) {
    console.log('   Status: GOOD - Minor category issues');
  } else {
    console.log('   Status: NEEDS WORK - Category mapping issues detected');
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');

  return {
    r365Categories: sortedR365Cats,
    dbCategories: sortedDbCats,
    mismatches,
    glAccountIssues: withoutGL
  };
}

auditCategories().catch(console.error);
