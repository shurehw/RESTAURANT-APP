import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function comprehensiveAudit() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('              COMPREHENSIVE DATA QUALITY AUDIT                  ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const { data: items } = await supabase
    .from('items')
    .select(`
      *,
      item_pack_configurations(*),
      gl_accounts(external_code, name)
    `)
    .eq('is_active', true);

  const total = items?.length || 0;
  const issues: any[] = [];

  console.log(`Auditing ${total} active items...\n`);

  // ===== AUDIT 1: NAMING CONVENTIONS =====
  console.log('━━━ 1. NAMING CONVENTIONS ━━━\n');

  let itemsWithUnits = 0;
  let itemsWithoutUnits = 0;
  const namingIssues: string[] = [];

  for (const item of items || []) {
    const hasUnit = /\d+(\.\d+)?(ml|mL|oz|fl\.oz|l|L|gal|lb|kg|g|in|each|case|pack|quart|qt)$/i.test(item.name);

    if (hasUnit) {
      itemsWithUnits++;
    } else {
      itemsWithoutUnits++;
      if (namingIssues.length < 5) {
        namingIssues.push(`${item.name} (${item.sku})`);
      }
    }
  }

  console.log(`✓ Items with unit in name: ${itemsWithUnits}/${total} (${((itemsWithUnits/total)*100).toFixed(1)}%)`);
  console.log(`✗ Items without unit: ${itemsWithoutUnits}`);

  if (namingIssues.length > 0) {
    console.log('\nSample items without units:');
    namingIssues.forEach(name => console.log(`  - ${name}`));
  }

  // ===== AUDIT 2: PACK CONFIGURATIONS =====
  console.log('\n━━━ 2. PACK CONFIGURATIONS ━━━\n');

  let itemsWithPacks = 0;
  let itemsWithoutPacks = 0;
  let invalidConversionFactors = 0;
  let duplicatePacks = 0;

  for (const item of items || []) {
    const packs = (item as any).item_pack_configurations || [];

    if (packs.length > 0) {
      itemsWithPacks++;

      // Check for invalid conversion factors
      for (const pack of packs) {
        const expected = pack.units_per_pack * pack.unit_size;
        if (Math.abs(pack.conversion_factor - expected) > 0.01) {
          invalidConversionFactors++;
          issues.push({
            type: 'Invalid Conversion Factor',
            item: item.name,
            issue: `Expected ${expected}, got ${pack.conversion_factor}`
          });
        }
      }

      // Check for duplicates
      const packKeys = new Set<string>();
      for (const pack of packs) {
        const key = `${pack.pack_type}|${pack.units_per_pack}|${pack.unit_size}|${pack.unit_size_uom}`;
        if (packKeys.has(key)) {
          duplicatePacks++;
          issues.push({
            type: 'Duplicate Pack Config',
            item: item.name,
            issue: `Duplicate: ${pack.units_per_pack} × ${pack.unit_size}${pack.unit_size_uom}`
          });
        }
        packKeys.add(key);
      }
    } else {
      itemsWithoutPacks++;
    }
  }

  console.log(`✓ Items with pack configs: ${itemsWithPacks}/${total} (${((itemsWithPacks/total)*100).toFixed(1)}%)`);
  console.log(`✗ Items without packs: ${itemsWithoutPacks}`);
  console.log(`✗ Invalid conversion factors: ${invalidConversionFactors}`);
  console.log(`✗ Duplicate pack configs: ${duplicatePacks}`);

  // ===== AUDIT 3: CATEGORY MAPPING =====
  console.log('\n━━━ 3. CATEGORY & GL ACCOUNT MAPPING ━━━\n');

  let itemsWithCategory = 0;
  let itemsWithSubcategory = 0;
  let itemsWithGL = 0;
  let categoryGLMismatches = 0;

  const validCategories = ['liquor', 'wine', 'beer', 'beverage', 'non_alcoholic_beverage', 'bar_consumables', 'food', 'packaging'];

  for (const item of items || []) {
    if (item.category) {
      itemsWithCategory++;

      if (!validCategories.includes(item.category)) {
        issues.push({
          type: 'Invalid Category',
          item: item.name,
          issue: `Unknown category: ${item.category}`
        });
      }
    }

    if (item.subcategory) itemsWithSubcategory++;

    const glAccount = (item as any).gl_accounts;
    if (glAccount?.external_code) {
      itemsWithGL++;

      // Verify category matches GL account
      const expectedGLPrefix = getCategoryGLPrefix(item.category);
      if (expectedGLPrefix && !glAccount.external_code.startsWith(expectedGLPrefix)) {
        categoryGLMismatches++;
        issues.push({
          type: 'Category/GL Mismatch',
          item: item.name,
          issue: `Category "${item.category}" should use GL ${expectedGLPrefix}xx, got ${glAccount.external_code}`
        });
      }
    }
  }

  console.log(`✓ Items with category: ${itemsWithCategory}/${total} (${((itemsWithCategory/total)*100).toFixed(1)}%)`);
  console.log(`✓ Items with subcategory: ${itemsWithSubcategory}/${total} (${((itemsWithSubcategory/total)*100).toFixed(1)}%)`);
  console.log(`✓ Items with GL account: ${itemsWithGL}/${total} (${((itemsWithGL/total)*100).toFixed(1)}%)`);
  console.log(`✗ Category/GL mismatches: ${categoryGLMismatches}`);

  // ===== AUDIT 4: R365 INTEGRATION FIELDS =====
  console.log('\n━━━ 4. R365 INTEGRATION FIELDS ━━━\n');

  const r365Fields = {
    measure_type: 0,
    reporting_uom: 0,
    inventory_uom: 0,
    cost_account: 0,
    inventory_account: 0,
    cost_update_method: 0,
  };

  for (const item of items || []) {
    if (item.r365_measure_type) r365Fields.measure_type++;
    if (item.r365_reporting_uom) r365Fields.reporting_uom++;
    if (item.r365_inventory_uom) r365Fields.inventory_uom++;
    if (item.r365_cost_account) r365Fields.cost_account++;
    if (item.r365_inventory_account) r365Fields.inventory_account++;
    if (item.r365_cost_update_method) r365Fields.cost_update_method++;
  }

  console.log(`Measure Type:        ${r365Fields.measure_type}/${total} (${((r365Fields.measure_type/total)*100).toFixed(1)}%)`);
  console.log(`Reporting UOM:       ${r365Fields.reporting_uom}/${total} (${((r365Fields.reporting_uom/total)*100).toFixed(1)}%)`);
  console.log(`Inventory UOM:       ${r365Fields.inventory_uom}/${total} (${((r365Fields.inventory_uom/total)*100).toFixed(1)}%)`);
  console.log(`Cost Account:        ${r365Fields.cost_account}/${total} (${((r365Fields.cost_account/total)*100).toFixed(1)}%)`);
  console.log(`Inventory Account:   ${r365Fields.inventory_account}/${total} (${((r365Fields.inventory_account/total)*100).toFixed(1)}%)`);
  console.log(`Cost Update Method:  ${r365Fields.cost_update_method}/${total} (${((r365Fields.cost_update_method/total)*100).toFixed(1)}%)`);

  // ===== AUDIT 5: DATA INTEGRITY =====
  console.log('\n━━━ 5. DATA INTEGRITY ━━━\n');

  let missingSKU = 0;
  let missingName = 0;
  let missingBaseUOM = 0;

  for (const item of items || []) {
    if (!item.sku) {
      missingSKU++;
      issues.push({ type: 'Missing SKU', item: item.name, issue: 'No SKU' });
    }
    if (!item.name) {
      missingName++;
      issues.push({ type: 'Missing Name', item: item.id, issue: 'No name' });
    }
    if (!item.base_uom) {
      missingBaseUOM++;
      issues.push({ type: 'Missing Base UOM', item: item.name, issue: 'No base UOM' });
    }
  }

  console.log(`✓ Items with SKU: ${total - missingSKU}/${total}`);
  console.log(`✓ Items with Name: ${total - missingName}/${total}`);
  console.log(`✓ Items with Base UOM: ${total - missingBaseUOM}/${total}`);

  // ===== SUMMARY =====
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         AUDIT SUMMARY                          ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const criticalIssues = issues.filter(i =>
    ['Missing SKU', 'Missing Name', 'Invalid Conversion Factor', 'Duplicate Pack Config'].includes(i.type)
  );
  const warningIssues = issues.filter(i =>
    ['Category/GL Mismatch', 'Invalid Category'].includes(i.type)
  );

  console.log(`Total Items Audited: ${total}`);
  console.log(`Critical Issues: ${criticalIssues.length}`);
  console.log(`Warnings: ${warningIssues.length}`);

  if (criticalIssues.length > 0) {
    console.log('\n🔴 CRITICAL ISSUES (showing first 10):');
    criticalIssues.slice(0, 10).forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.type}] ${issue.item}`);
      console.log(`     → ${issue.issue}`);
    });
  }

  if (warningIssues.length > 0) {
    console.log('\n⚠️  WARNINGS (showing first 10):');
    warningIssues.slice(0, 10).forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.type}] ${issue.item}`);
      console.log(`     → ${issue.issue}`);
    });
  }

  // Calculate overall score
  const scores = {
    naming: ((itemsWithUnits / total) * 100),
    packs: ((itemsWithPacks / total) * 100),
    categories: ((itemsWithGL / total) * 100),
    r365: ((r365Fields.measure_type / total) * 100),
    integrity: (((total - missingSKU - missingName - missingBaseUOM) / (total * 3)) * 100)
  };

  const overallScore = Math.round(
    (scores.naming * 0.15) +
    (scores.packs * 0.25) +
    (scores.categories * 0.25) +
    (scores.r365 * 0.25) +
    (scores.integrity * 0.10)
  );

  console.log('\n📊 QUALITY SCORES:');
  console.log(`  Naming Conventions:  ${scores.naming.toFixed(1)}%`);
  console.log(`  Pack Configurations: ${scores.packs.toFixed(1)}%`);
  console.log(`  Category Mapping:    ${scores.categories.toFixed(1)}%`);
  console.log(`  R365 Integration:    ${scores.r365.toFixed(1)}%`);
  console.log(`  Data Integrity:      ${scores.integrity.toFixed(1)}%`);

  console.log(`\n✨ OVERALL DATA QUALITY SCORE: ${overallScore}/100`);

  if (overallScore >= 95) {
    console.log('   Status: ✅ EXCELLENT - Production ready');
  } else if (overallScore >= 85) {
    console.log('   Status: ✓ GOOD - Minor issues to address');
  } else if (overallScore >= 75) {
    console.log('   Status: ⚠️  FAIR - Some improvements needed');
  } else {
    console.log('   Status: ❌ NEEDS WORK - Significant issues detected');
  }

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

function getCategoryGLPrefix(category: string): string | null {
  const map: Record<string, string> = {
    'liquor': '5310',
    'wine': '5320',
    'beer': '5330',
    'beverage': '5330',
    'non_alcoholic_beverage': '5335',
    'bar_consumables': '5315',
    'food': '5100',
    'packaging': '5400'
  };
  return map[category] || null;
}

comprehensiveAudit().catch(console.error);
