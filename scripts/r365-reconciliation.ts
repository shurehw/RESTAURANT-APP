import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ReconciliationIssue {
  type: 'MISSING' | 'MISMATCH' | 'EXTRA' | 'INCOMPLETE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  category: string;
  r365Item: string;
  r365Sku: string;
  dbItem?: string;
  dbSku?: string;
  issue: string;
  r365Data?: any;
  dbData?: any;
}

async function reconcileR365Data() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('   SENIOR FP&A RECONCILIATION: R365 EXCEL vs DATABASE         ');
  console.log('══════════════════════════════════════════════════════════════\n');

  const issues: ReconciliationIssue[] = [];

  // Load R365 Excel
  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  console.log(`📄 R365 Excel File Loaded: ${excelData.length} rows\n`);

  // Process R365 data
  const r365ItemsBySku = new Map();
  const r365ItemsByName = new Map();

  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    const name = String(row['ITEM      '] || '').trim();
    const packSize = String(row['PACK SIZE      '] || '').trim();

    const itemData = {
      name,
      sku,
      packSize,
      category: String(row['Item Category 1'] || '').trim(),
      subcategory: String(row['SUBCATEGORY      '] || '').trim(),
      measureType: row['Measure Type'],
      reportingUom: row['Reporting U of M'],
      inventoryUom: row['Inventory U of M'],
      costAccount: row['Cost Account'],
      inventoryAccount: row['Inventory Account'],
      costUpdateMethod: row['Cost Update Method'],
      keyItem: row['Key Item']
    };

    if (sku) {
      if (!r365ItemsBySku.has(sku)) {
        r365ItemsBySku.set(sku, []);
      }
      r365ItemsBySku.get(sku).push(itemData);
    }

    if (name) {
      if (!r365ItemsByName.has(name.toLowerCase())) {
        r365ItemsByName.set(name.toLowerCase(), []);
      }
      r365ItemsByName.get(name.toLowerCase()).push(itemData);
    }
  }

  console.log(`📊 Unique R365 Items by SKU: ${r365ItemsBySku.size}`);
  console.log(`📊 Unique R365 Items by Name: ${r365ItemsByName.size}\n`);

  // Load Database Items
  const { data: dbItems } = await supabase
    .from('items')
    .select('*')
    .eq('is_active', true);

  const { data: dbConfigs } = await supabase
    .from('item_pack_configurations')
    .select('*');

  const configsByItemId = new Map();
  for (const config of dbConfigs || []) {
    if (!configsByItemId.has(config.item_id)) {
      configsByItemId.set(config.item_id, []);
    }
    configsByItemId.get(config.item_id).push(config);
  }

  console.log(`💾 Database Items: ${dbItems?.length || 0}`);
  console.log(`💾 Database Pack Configs: ${dbConfigs?.length || 0}\n`);

  // RECONCILIATION 1: Check all R365 items exist in DB
  console.log('═══ RECONCILIATION 1: R365 → DATABASE COMPLETENESS ═══\n');

  let r365Found = 0;
  let r365Missing = 0;
  let r365MissingPacks = 0;

  for (const [sku, r365Items] of r365ItemsBySku.entries()) {
    const r365Item = r365Items[0]; // Take first occurrence

    // Find in DB by SKU
    let dbItem = dbItems?.find(i => i.sku === sku);

    // If not found by SKU, try by name
    if (!dbItem) {
      dbItem = dbItems?.find(i => i.name.toLowerCase() === r365Item.name.toLowerCase());
    }

    if (!dbItem) {
      r365Missing++;
      issues.push({
        type: 'MISSING',
        severity: 'CRITICAL',
        category: 'Item Missing',
        r365Item: r365Item.name,
        r365Sku: sku,
        issue: 'R365 item not found in database',
        r365Data: r365Item
      });
    } else {
      r365Found++;

      // Check if has pack config
      const configs = configsByItemId.get(dbItem.id);
      if (!configs || configs.length === 0) {
        r365MissingPacks++;
        issues.push({
          type: 'INCOMPLETE',
          severity: 'HIGH',
          category: 'Missing Pack Config',
          r365Item: r365Item.name,
          r365Sku: sku,
          dbItem: dbItem.name,
          dbSku: dbItem.sku,
          issue: `Item exists but missing pack config. R365 pack size: "${r365Item.packSize}"`,
          r365Data: r365Item,
          dbData: dbItem
        });
      }

      // Check R365 field completeness
      const missingFields = [];
      if (!dbItem.r365_measure_type) missingFields.push('measure_type');
      if (!dbItem.r365_reporting_uom) missingFields.push('reporting_uom');
      if (!dbItem.r365_inventory_uom) missingFields.push('inventory_uom');
      if (!dbItem.r365_cost_account) missingFields.push('cost_account');
      if (!dbItem.r365_inventory_account) missingFields.push('inventory_account');

      if (missingFields.length > 0) {
        issues.push({
          type: 'INCOMPLETE',
          severity: 'MEDIUM',
          category: 'Missing R365 Fields',
          r365Item: r365Item.name,
          r365Sku: sku,
          dbItem: dbItem.name,
          dbSku: dbItem.sku,
          issue: `Missing R365 fields: ${missingFields.join(', ')}`,
          r365Data: r365Item,
          dbData: dbItem
        });
      }
    }
  }

  console.log(`✓ R365 Items Found in DB: ${r365Found}`);
  console.log(`✗ R365 Items Missing from DB: ${r365Missing}`);
  console.log(`⚠ R365 Items Without Pack Configs: ${r365MissingPacks}\n`);

  // RECONCILIATION 2: Check for data mismatches
  console.log('═══ RECONCILIATION 2: DATA QUALITY CHECKS ═══\n');

  let skuMismatches = 0;
  let nameMismatches = 0;

  for (const dbItem of dbItems || []) {
    const r365Items = r365ItemsBySku.get(dbItem.sku);

    if (r365Items && r365Items[0]) {
      const r365Item = r365Items[0];

      // Check name match
      if (dbItem.name.toLowerCase() !== r365Item.name.toLowerCase()) {
        nameMismatches++;
        issues.push({
          type: 'MISMATCH',
          severity: 'MEDIUM',
          category: 'Name Mismatch',
          r365Item: r365Item.name,
          r365Sku: dbItem.sku,
          dbItem: dbItem.name,
          dbSku: dbItem.sku,
          issue: `Name mismatch between R365 and DB`,
          r365Data: r365Item,
          dbData: dbItem
        });
      }
    }
  }

  console.log(`⚠ SKU Mismatches: ${skuMismatches}`);
  console.log(`⚠ Name Mismatches: ${nameMismatches}\n`);

  // SUMMARY REPORT
  console.log('══════════════════════════════════════════════════════════════');
  console.log('                    RECONCILIATION SUMMARY                     ');
  console.log('══════════════════════════════════════════════════════════════\n');

  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');

  console.log(`Total Issues: ${issues.length}`);
  console.log(`  🔴 CRITICAL: ${critical.length} (Items missing from database)`);
  console.log(`  🟠 HIGH:     ${high.length} (Items without pack configs)`);
  console.log(`  🟡 MEDIUM:   ${medium.length} (Data quality issues)\n`);

  // Show critical issues
  if (critical.length > 0) {
    console.log('🔴 CRITICAL: Items in R365 Excel NOT in Database:\n');
    critical.slice(0, 20).forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.r365Item} (SKU: ${issue.r365Sku})`);
      console.log(`   Pack Size: "${issue.r365Data.packSize}"`);
      console.log(`   Category: ${issue.r365Data.category}\n`);
    });
    if (critical.length > 20) {
      console.log(`   ... and ${critical.length - 20} more\n`);
    }
  }

  // Show high priority issues
  if (high.length > 0) {
    console.log('🟠 HIGH: Items Missing Pack Configs:\n');
    high.slice(0, 20).forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.dbItem} (SKU: ${issue.dbSku})`);
      console.log(`   R365 Pack Size: "${issue.r365Data.packSize}"\n`);
    });
    if (high.length > 20) {
      console.log(`   ... and ${high.length - 20} more\n`);
    }
  }

  // RECOMMENDATIONS
  console.log('══════════════════════════════════════════════════════════════');
  console.log('                       RECOMMENDATIONS                         ');
  console.log('══════════════════════════════════════════════════════════════\n');

  if (critical.length > 0) {
    console.log(`1. ADD ${critical.length} MISSING ITEMS to database`);
    console.log('   - These items exist in R365 Excel but not in our system');
    console.log('   - May have been skipped during initial import\n');
  }

  if (high.length > 0) {
    console.log(`2. ADD PACK CONFIGS for ${high.length} items`);
    console.log('   - Items exist but missing pack configuration');
    console.log('   - Required for R365 export and purchasing\n');
  }

  if (medium.length > 0) {
    console.log(`3. FIX ${medium.length} DATA QUALITY ISSUES`);
    console.log('   - Missing R365 integration fields');
    console.log('   - Name mismatches between systems\n');
  }

  // Calculate reconciliation score
  const totalR365Items = r365ItemsBySku.size;
  const successRate = ((r365Found / totalR365Items) * 100).toFixed(1);
  const packConfigRate = (((r365Found - r365MissingPacks) / totalR365Items) * 100).toFixed(1);

  console.log('══════════════════════════════════════════════════════════════');
  console.log('                    RECONCILIATION SCORE                       ');
  console.log('══════════════════════════════════════════════════════════════\n');
  console.log(`Item Completeness: ${successRate}% (${r365Found}/${totalR365Items})`);
  console.log(`Pack Config Coverage: ${packConfigRate}% (${r365Found - r365MissingPacks}/${totalR365Items})`);

  const overallScore = Math.round((parseFloat(successRate) + parseFloat(packConfigRate)) / 2);
  console.log(`\n✅ OVERALL RECONCILIATION SCORE: ${overallScore}/100`);

  if (overallScore >= 95) {
    console.log('   Status: EXCELLENT - Database matches R365 ✓');
  } else if (overallScore >= 85) {
    console.log('   Status: GOOD - Minor gaps to fill');
  } else if (overallScore >= 70) {
    console.log('   Status: FAIR - Significant work needed');
  } else {
    console.log('   Status: POOR - Major discrepancies found');
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');

  return {
    issues,
    stats: {
      totalR365Items,
      r365Found,
      r365Missing,
      r365MissingPacks,
      successRate: parseFloat(successRate),
      packConfigRate: parseFloat(packConfigRate),
      overallScore
    }
  };
}

reconcileR365Data().catch(console.error);
