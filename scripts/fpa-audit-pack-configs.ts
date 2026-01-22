import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AuditIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  item: string;
  issue: string;
  impact: string;
}

async function fpAudit() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('        FP&A AUDIT: PACK CONFIGURATION DATA QUALITY         ');
  console.log('═══════════════════════════════════════════════════════════\n');

  const issues: AuditIssue[] = [];

  // 1. DATA COMPLETENESS AUDIT
  console.log('📊 SECTION 1: DATA COMPLETENESS AUDIT\n');

  const { data: items } = await supabase.from('items').select('*').eq('is_active', true);
  const { data: configs } = await supabase.from('item_pack_configurations').select('*');

  const itemsWithConfigs = new Set(configs?.map(c => c.item_id) || []);
  const totalItems = items?.length || 0;
  const itemsWithPacks = itemsWithConfigs.size;
  const itemsWithoutPacks = totalItems - itemsWithPacks;
  const coverage = ((itemsWithPacks / totalItems) * 100).toFixed(1);

  console.log(`Total Active Items: ${totalItems}`);
  console.log(`Items WITH Pack Configs: ${itemsWithPacks} (${coverage}%)`);
  console.log(`Items WITHOUT Pack Configs: ${itemsWithoutPacks} (${(100 - parseFloat(coverage)).toFixed(1)}%)`);

  if (itemsWithoutPacks > totalItems * 0.15) {
    issues.push({
      severity: 'HIGH',
      category: 'Completeness',
      item: 'Overall Coverage',
      issue: `${itemsWithoutPacks} items (${(100 - parseFloat(coverage)).toFixed(1)}%) missing pack configs`,
      impact: 'Cannot export to R365, COGS calculations will be inaccurate'
    });
  }

  // 2. R365 INTEGRATION AUDIT
  console.log('\n📋 SECTION 2: R365 INTEGRATION READINESS\n');

  const excelPath = 'C:\\Users\\JacobShure\\Downloads\\OpsOs Bev Import.xlsx';
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const excelData = XLSX.utils.sheet_to_json(sheet);

  const r365Items = new Map();
  for (const row of excelData as any[]) {
    const sku = String(row['SKU      '] || '').trim();
    if (sku) r365Items.set(sku, true);
  }

  let r365ItemsInDb = 0;
  let r365ItemsWithPacks = 0;
  for (const item of items || []) {
    if (r365Items.has(item.sku)) {
      r365ItemsInDb++;
      if (itemsWithConfigs.has(item.id)) {
        r365ItemsWithPacks++;
      } else {
        issues.push({
          severity: 'CRITICAL',
          category: 'R365 Export',
          item: `${item.name} (${item.sku})`,
          issue: 'R365 item missing pack configuration',
          impact: 'Cannot export to R365, will cause import errors'
        });
      }
    }
  }

  const r365Coverage = ((r365ItemsWithPacks / r365ItemsInDb) * 100).toFixed(1);
  console.log(`R365 Items in Database: ${r365ItemsInDb}`);
  console.log(`R365 Items WITH Pack Configs: ${r365ItemsWithPacks} (${r365Coverage}%)`);
  console.log(`R365 Items WITHOUT Pack Configs: ${r365ItemsInDb - r365ItemsWithPacks}`);

  // 3. DATA INTEGRITY AUDIT
  console.log('\n🔍 SECTION 3: DATA INTEGRITY AUDIT\n');

  let invalidConversions = 0;
  let missingVendorCodes = 0;
  let invalidUnits = 0;
  let negativeValues = 0;
  let zeroValues = 0;

  for (const config of configs || []) {
    const item = items?.find(i => i.id === config.item_id);
    const itemName = item?.name || 'Unknown Item';

    // Check conversion factor
    const expectedConversion = config.units_per_pack * config.unit_size;
    if (Math.abs(config.conversion_factor - expectedConversion) > 0.01) {
      invalidConversions++;
      issues.push({
        severity: 'HIGH',
        category: 'Data Integrity',
        item: itemName,
        issue: `Invalid conversion_factor: ${config.conversion_factor} (expected ${expectedConversion})`,
        impact: 'COGS calculations will be incorrect, recipe costing will be wrong'
      });
    }

    // Check for missing vendor codes (R365 items should have them)
    if (!config.vendor_item_code && item && r365Items.has(item.sku)) {
      missingVendorCodes++;
    }

    // Check for invalid units
    const validUnits = ['ml', 'l', 'oz', 'fl.oz', 'gal', 'lb', 'kg', 'g', 'each', 'case', 'pack', 'quart'];
    if (!validUnits.includes(config.unit_size_uom.toLowerCase())) {
      invalidUnits++;
      issues.push({
        severity: 'MEDIUM',
        category: 'Data Integrity',
        item: itemName,
        issue: `Non-standard unit: "${config.unit_size_uom}"`,
        impact: 'Unit conversion may fail, reporting inconsistencies'
      });
    }

    // Check for negative values
    if (config.units_per_pack < 0 || config.unit_size < 0 || config.conversion_factor < 0) {
      negativeValues++;
      issues.push({
        severity: 'CRITICAL',
        category: 'Data Integrity',
        item: itemName,
        issue: `Negative values: units=${config.units_per_pack}, size=${config.unit_size}, conversion=${config.conversion_factor}`,
        impact: 'System errors, negative COGS, corrupted inventory calculations'
      });
    }

    // Check for zero values
    if (config.units_per_pack === 0 || config.unit_size === 0 || config.conversion_factor === 0) {
      zeroValues++;
      issues.push({
        severity: 'CRITICAL',
        category: 'Data Integrity',
        item: itemName,
        issue: `Zero values: units=${config.units_per_pack}, size=${config.unit_size}, conversion=${config.conversion_factor}`,
        impact: 'Division by zero errors, inventory calculations will fail'
      });
    }
  }

  console.log(`Total Pack Configs: ${configs?.length || 0}`);
  console.log(`Invalid Conversion Factors: ${invalidConversions}`);
  console.log(`Missing Vendor Codes (R365 items): ${missingVendorCodes}`);
  console.log(`Non-Standard Units: ${invalidUnits}`);
  console.log(`Negative Values: ${negativeValues}`);
  console.log(`Zero Values: ${zeroValues}`);

  // 4. UNIT DISTRIBUTION ANALYSIS
  console.log('\n📈 SECTION 4: UNIT DISTRIBUTION ANALYSIS\n');

  const unitDistribution = new Map<string, number>();
  const packTypeDistribution = new Map<string, number>();

  for (const config of configs || []) {
    const unit = config.unit_size_uom.toLowerCase();
    unitDistribution.set(unit, (unitDistribution.get(unit) || 0) + 1);

    const packType = config.pack_type;
    packTypeDistribution.set(packType, (packTypeDistribution.get(packType) || 0) + 1);
  }

  console.log('Unit Distribution:');
  Array.from(unitDistribution.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([unit, count]) => {
      const pct = ((count / (configs?.length || 1)) * 100).toFixed(1);
      console.log(`  ${unit.padEnd(10)} ${count.toString().padStart(4)} (${pct}%)`);
    });

  console.log('\nPack Type Distribution:');
  Array.from(packTypeDistribution.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const pct = ((count / (configs?.length || 1)) * 100).toFixed(1);
      console.log(`  ${type.padEnd(10)} ${count.toString().padStart(4)} (${pct}%)`);
    });

  // 5. OUTLIER DETECTION
  console.log('\n⚠️  SECTION 5: OUTLIER DETECTION\n');

  const conversions = configs?.map(c => c.conversion_factor).filter(c => c > 0) || [];
  conversions.sort((a, b) => a - b);
  const median = conversions[Math.floor(conversions.length / 2)];
  const q1 = conversions[Math.floor(conversions.length * 0.25)];
  const q3 = conversions[Math.floor(conversions.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = q1 - 3 * iqr;
  const upperBound = q3 + 3 * iqr;

  console.log(`Median Conversion Factor: ${median.toFixed(2)}`);
  console.log(`Q1: ${q1.toFixed(2)}, Q3: ${q3.toFixed(2)}, IQR: ${iqr.toFixed(2)}`);
  console.log(`Outlier Bounds: [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`);

  let outlierCount = 0;
  for (const config of configs || []) {
    if (config.conversion_factor < lowerBound || config.conversion_factor > upperBound) {
      outlierCount++;
      const item = items?.find(i => i.id === config.item_id);
      if (outlierCount <= 10) {
        issues.push({
          severity: 'LOW',
          category: 'Outlier',
          item: item?.name || 'Unknown',
          issue: `Unusual conversion factor: ${config.conversion_factor} (${config.units_per_pack} × ${config.unit_size}${config.unit_size_uom})`,
          impact: 'May indicate data entry error - review for accuracy'
        });
      }
    }
  }

  console.log(`Outliers Detected: ${outlierCount}`);

  // 6. DUPLICATE RISK ASSESSMENT
  console.log('\n🔄 SECTION 6: DUPLICATE RISK ASSESSMENT\n');

  const uniqueKeys = new Set();
  let potentialDuplicates = 0;

  for (const config of configs || []) {
    const key = `${config.item_id}|${config.pack_type}|${config.units_per_pack}|${config.unit_size}|${config.unit_size_uom}`;
    if (uniqueKeys.has(key)) {
      potentialDuplicates++;
      const item = items?.find(i => i.id === config.item_id);
      issues.push({
        severity: 'MEDIUM',
        category: 'Duplicates',
        item: item?.name || 'Unknown',
        issue: `Duplicate pack configuration detected`,
        impact: 'UI confusion, potential for incorrect pack selection'
      });
    }
    uniqueKeys.add(key);
  }

  console.log(`Potential Duplicates: ${potentialDuplicates}`);
  console.log(`Unique Configurations: ${uniqueKeys.size}`);

  // FINAL REPORT
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    AUDIT FINDINGS SUMMARY                  ');
  console.log('═══════════════════════════════════════════════════════════\n');

  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');
  const low = issues.filter(i => i.severity === 'LOW');

  console.log(`Total Issues Found: ${issues.length}`);
  console.log(`  🔴 CRITICAL: ${critical.length}`);
  console.log(`  🟠 HIGH:     ${high.length}`);
  console.log(`  🟡 MEDIUM:   ${medium.length}`);
  console.log(`  🔵 LOW:      ${low.length}\n`);

  if (critical.length > 0) {
    console.log('🔴 CRITICAL ISSUES (Must Fix Immediately):\n');
    critical.slice(0, 10).forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.category}: ${issue.item}`);
      console.log(`   Issue: ${issue.issue}`);
      console.log(`   Impact: ${issue.impact}\n`);
    });
  }

  if (high.length > 0) {
    console.log('🟠 HIGH PRIORITY ISSUES (Fix Soon):\n');
    high.slice(0, 5).forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.category}: ${issue.item}`);
      console.log(`   Issue: ${issue.issue}`);
      console.log(`   Impact: ${issue.impact}\n`);
    });
  }

  // RECOMMENDATIONS
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    RECOMMENDATIONS                         ');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (parseFloat(coverage) < 95) {
    console.log('1. COVERAGE: Target 95%+ pack config coverage for accurate COGS');
    console.log(`   Current: ${coverage}% | Gap: ${(95 - parseFloat(coverage)).toFixed(1)}% | Action: Add ${Math.ceil(totalItems * 0.95 - itemsWithPacks)} more configs\n`);
  }

  if (r365ItemsInDb - r365ItemsWithPacks > 0) {
    console.log('2. R365 INTEGRATION: All R365 items must have pack configs for export');
    console.log(`   Missing: ${r365ItemsInDb - r365ItemsWithPacks} items | Action: Review and add pack configs\n`);
  }

  if (invalidConversions > 0) {
    console.log(`3. DATA QUALITY: Fix ${invalidConversions} invalid conversion factors`);
    console.log('   Impact: Incorrect COGS, recipe costs, and inventory valuations\n');
  }

  if (potentialDuplicates > 0) {
    console.log(`4. DUPLICATES: Remove ${potentialDuplicates} duplicate pack configurations`);
    console.log('   Impact: User confusion, potential for order errors\n');
  }

  console.log('\n✅ AUDIT QUALITY SCORE:');
  const qualityScore = Math.max(0, 100 - (critical.length * 10) - (high.length * 5) - (medium.length * 2) - (low.length * 0.5));
  console.log(`   ${qualityScore.toFixed(0)}/100`);

  if (qualityScore >= 95) {
    console.log('   Status: EXCELLENT - Production Ready ✓');
  } else if (qualityScore >= 85) {
    console.log('   Status: GOOD - Minor fixes needed');
  } else if (qualityScore >= 70) {
    console.log('   Status: FAIR - Address high priority issues');
  } else {
    console.log('   Status: POOR - Critical issues must be resolved');
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

fpAudit().catch(console.error);
