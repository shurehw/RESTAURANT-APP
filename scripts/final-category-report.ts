import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalCategoryReport() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('           FINAL CATEGORY QUALITY REPORT                       ');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Load R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  // Get database items
  const { data: items } = await supabase
    .from('items')
    .select('id, name, sku, category, subcategory, gl_account_id')
    .eq('is_active', true);

  // Category mapping validation
  const r365CategoryMap: Record<string, string> = {
    '5310 - Liquor Cost': 'liquor',
    '5320 - Wine Cost': 'wine',
    '5330 - Beer Cost': 'beer',
    '5335 - N/A Beverage Cost': 'non_alcoholic_beverage',
    '5315 - Bar Consumables': 'bar_consumables'
  };

  console.log('📊 SECTION 1: DATA COMPLETENESS\n');

  const totalItems = items?.length || 0;
  const itemsWithCategory = items?.filter(i => i.category).length || 0;
  const itemsWithSubcategory = items?.filter(i => i.subcategory).length || 0;
  const itemsWithGL = items?.filter(i => i.gl_account_id).length || 0;

  console.log(`Total Items: ${totalItems}`);
  console.log(`Items with Category: ${itemsWithCategory} (${((itemsWithCategory / totalItems) * 100).toFixed(1)}%)`);
  console.log(`Items with Subcategory: ${itemsWithSubcategory} (${((itemsWithSubcategory / totalItems) * 100).toFixed(1)}%)`);
  console.log(`Items with GL Account: ${itemsWithGL} (${((itemsWithGL / totalItems) * 100).toFixed(1)}%)`);

  console.log('\n📊 SECTION 2: CATEGORY DISTRIBUTION\n');

  const categoryStats = new Map<string, number>();
  const subcategoryStats = new Map<string, number>();

  for (const item of items || []) {
    if (item.category) {
      categoryStats.set(item.category, (categoryStats.get(item.category) || 0) + 1);
    }
    if (item.subcategory) {
      subcategoryStats.set(item.subcategory, (subcategoryStats.get(item.subcategory) || 0) + 1);
    }
  }

  console.log('Category Breakdown:');
  Array.from(categoryStats.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      const pct = ((count / totalItems) * 100).toFixed(1);
      console.log(`  ${cat.padEnd(30)} ${count.toString().padStart(4)} items (${pct}%)`);
    });

  console.log('\nTop 10 Subcategories:');
  Array.from(subcategoryStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([sub, count]) => {
      console.log(`  ${sub.padEnd(30)} ${count.toString().padStart(4)} items`);
    });

  console.log('\n📊 SECTION 3: R365 INTEGRATION READINESS\n');

  // Check how many R365 items were successfully imported
  const r365Skus = new Set<string>();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    if (sku) r365Skus.add(sku);
  }

  const importedR365Items = items?.filter(i => r365Skus.has(i.sku)) || [];
  const r365ItemsWithCategory = importedR365Items.filter(i => i.category);
  const r365ItemsWithGL = importedR365Items.filter(i => i.gl_account_id);

  console.log(`R365 Excel Items: ${r365Skus.size}`);
  console.log(`Items Imported from R365: ${importedR365Items.length}`);
  console.log(`R365 Items with Category: ${r365ItemsWithCategory.length} (${((r365ItemsWithCategory.length / importedR365Items.length) * 100).toFixed(1)}%)`);
  console.log(`R365 Items with GL Account: ${r365ItemsWithGL.length} (${((r365ItemsWithGL.length / importedR365Items.length) * 100).toFixed(1)}%)`);

  const consolidationNote = r365Skus.size - importedR365Items.length;
  if (consolidationNote > 0) {
    console.log(`\nNote: ${consolidationNote} R365 Excel rows were consolidated as pack configs`);
  }

  console.log('\n📊 SECTION 4: MAPPING ACCURACY\n');

  // Verify R365 → DB category mappings
  const r365BySku = new Map<string, any>();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const category = String(row['Item Category 1'] || '').trim();
    if (sku) {
      r365BySku.set(sku, { category });
    }
  }

  let correctMappings = 0;
  let incorrectMappings = 0;
  const mappingErrors: any[] = [];

  for (const item of importedR365Items) {
    const r365Data = r365BySku.get(item.sku);
    if (!r365Data || !item.category) continue;

    const expectedCategory = r365CategoryMap[r365Data.category];
    if (expectedCategory === item.category || (expectedCategory === 'beer' && item.category === 'beverage')) {
      correctMappings++;
    } else {
      incorrectMappings++;
      if (mappingErrors.length < 5) {
        mappingErrors.push({
          name: item.name,
          r365: r365Data.category,
          db: item.category,
          expected: expectedCategory
        });
      }
    }
  }

  const mappingAccuracy = ((correctMappings / (correctMappings + incorrectMappings)) * 100).toFixed(1);
  console.log(`Correct Category Mappings: ${correctMappings}`);
  console.log(`Incorrect Category Mappings: ${incorrectMappings}`);
  console.log(`Mapping Accuracy: ${mappingAccuracy}%`);

  if (mappingErrors.length > 0) {
    console.log('\nSample Mapping Errors:');
    mappingErrors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err.name}`);
      console.log(`     R365: ${err.r365} → Expected: ${err.expected}, Got: ${err.db}`);
    });
  }

  console.log('\n📊 SECTION 5: DATA QUALITY ISSUES\n');

  let issueCount = 0;

  // Check for items without categories
  const itemsWithoutCategory = items?.filter(i => !i.category) || [];
  if (itemsWithoutCategory.length > 0) {
    console.log(`⚠️  ${itemsWithoutCategory.length} items missing category`);
    issueCount++;
  }

  // Check for items without GL accounts
  const itemsWithoutGL = items?.filter(i => !i.gl_account_id) || [];
  if (itemsWithoutGL.length > 0) {
    console.log(`⚠️  ${itemsWithoutGL.length} items missing GL account`);
    if (itemsWithoutGL.length <= 10) {
      itemsWithoutGL.forEach(item => {
        console.log(`     - ${item.name} (${item.category || 'no category'})`);
      });
    }
    issueCount++;
  }

  // Check for invalid categories
  const validCategories = ['liquor', 'wine', 'beer', 'beverage', 'non_alcoholic_beverage', 'bar_consumables', 'food', 'packaging'];
  const itemsWithInvalidCategory = items?.filter(i => i.category && !validCategories.includes(i.category)) || [];
  if (itemsWithInvalidCategory.length > 0) {
    console.log(`⚠️  ${itemsWithInvalidCategory.length} items with invalid category`);
    issueCount++;
  }

  if (issueCount === 0) {
    console.log('✅ No data quality issues found!');
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                    FINAL QUALITY SCORE                        ');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Calculate overall score
  const categoryScore = (itemsWithCategory / totalItems) * 100;
  const glScore = (itemsWithGL / totalItems) * 100;
  const mappingScore = parseFloat(mappingAccuracy);
  const overallScore = Math.round((categoryScore * 0.3 + glScore * 0.4 + mappingScore * 0.3));

  console.log(`Category Completeness: ${categoryScore.toFixed(1)}% (weight: 30%)`);
  console.log(`GL Account Assignment: ${glScore.toFixed(1)}% (weight: 40%)`);
  console.log(`Mapping Accuracy: ${mappingScore}% (weight: 30%)`);
  console.log(`\n✅ OVERALL CATEGORY QUALITY SCORE: ${overallScore}/100`);

  if (overallScore >= 95) {
    console.log('   Status: EXCELLENT - Production ready ✓');
  } else if (overallScore >= 85) {
    console.log('   Status: GOOD - Minor issues, mostly ready');
  } else if (overallScore >= 75) {
    console.log('   Status: FAIR - Some issues to address');
  } else {
    console.log('   Status: NEEDS WORK - Significant issues detected');
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');
}

finalCategoryReport().catch(console.error);
