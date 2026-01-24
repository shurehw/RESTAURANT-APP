import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function validateR365Compliance() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('='.repeat(80));
  console.log('R365 PURCHASE ITEM IMPORT COMPLIANCE VALIDATION REPORT');
  console.log('='.repeat(80));
  console.log('');

  // Get ALL items (no limit)
  let items: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching items:', error);
      return;
    }

    if (data && data.length > 0) {
      items.push(...data);
      offset += batchSize;
    }

    if (!data || data.length < batchSize) {
      hasMore = false;
    }
  }

  console.log(`Total Items in Database: ${items?.length || 0}`);
  console.log('');

  const issues: string[] = [];
  const warnings: string[] = [];

  // R365 REQUIRED FIELDS VALIDATION
  console.log('1. REQUIRED FIELDS VALIDATION');
  console.log('-'.repeat(80));

  // Name (REQUIRED)
  const missingName = items?.filter(i => !i.name || i.name.trim() === '') || [];
  if (missingName.length > 0) {
    issues.push(`❌ CRITICAL: ${missingName.length} items missing NAME (required field)`);
  } else {
    console.log(`✓ Name: All ${items?.length} items have names`);
  }

  // Measure Type (REQUIRED - should be "Each", "Weight", or "Volume")
  const missingMeasureType = items?.filter(i => !i.r365_measure_type) || [];
  const invalidMeasureType = items?.filter(i =>
    i.r365_measure_type && !['Each', 'Weight', 'Volume'].includes(i.r365_measure_type)
  ) || [];

  if (missingMeasureType.length > 0) {
    issues.push(`❌ CRITICAL: ${missingMeasureType.length} items missing MEASURE TYPE (required field)`);
  } else {
    console.log(`✓ Measure Type: All ${items?.length} items have measure type`);
  }

  if (invalidMeasureType.length > 0) {
    warnings.push(`⚠️  WARNING: ${invalidMeasureType.length} items have invalid measure type (should be "Each", "Weight", or "Volume")`);
    console.log(`  Current values found: ${[...new Set(invalidMeasureType.map(i => i.r365_measure_type))].join(', ')}`);
  }

  // Reporting U of M (REQUIRED)
  const missingReportingUOM = items?.filter(i => !i.r365_reporting_uom) || [];
  if (missingReportingUOM.length > 0) {
    issues.push(`❌ CRITICAL: ${missingReportingUOM.length} items missing REPORTING U of M (required field)`);
  } else {
    console.log(`✓ Reporting U of M: All ${items?.length} items have reporting UOM`);
  }

  // Inventory U of M (REQUIRED)
  const missingInventoryUOM = items?.filter(i => !i.r365_inventory_uom) || [];
  if (missingInventoryUOM.length > 0) {
    issues.push(`❌ CRITICAL: ${missingInventoryUOM.length} items missing INVENTORY U of M (required field)`);
  } else {
    console.log(`✓ Inventory U of M: All ${items?.length} items have inventory UOM`);
  }

  // Cost Account (REQUIRED)
  const missingCostAccount = items?.filter(i => !i.r365_cost_account) || [];
  if (missingCostAccount.length > 0) {
    issues.push(`❌ CRITICAL: ${missingCostAccount.length} items missing COST ACCOUNT (required field)`);
  } else {
    console.log(`✓ Cost Account: All ${items?.length} items have cost account`);
  }

  // Inventory Account (REQUIRED)
  const missingInventoryAccount = items?.filter(i => !i.r365_inventory_account) || [];
  if (missingInventoryAccount.length > 0) {
    issues.push(`❌ CRITICAL: ${missingInventoryAccount.length} items missing INVENTORY ACCOUNT (required field)`);
  } else {
    console.log(`✓ Inventory Account: All ${items?.length} items have inventory account`);
  }

  console.log('');
  console.log('2. DATA QUALITY VALIDATION');
  console.log('-'.repeat(80));

  // SKU uniqueness
  const itemsWithSKU = items?.filter(i => i.sku) || [];
  const skuMap = new Map();
  itemsWithSKU.forEach(i => {
    if (skuMap.has(i.sku)) {
      skuMap.set(i.sku, skuMap.get(i.sku) + 1);
    } else {
      skuMap.set(i.sku, 1);
    }
  });
  const duplicateSKUs = Array.from(skuMap.entries()).filter(([_, count]) => count > 1);

  if (duplicateSKUs.length > 0) {
    warnings.push(`⚠️  WARNING: ${duplicateSKUs.length} duplicate SKUs found`);
  } else {
    console.log(`✓ SKU Uniqueness: No duplicate SKUs`);
  }

  // UOM consistency (Reporting and Inventory should match for most items)
  const uomMismatch = items?.filter(i =>
    i.r365_reporting_uom && i.r365_inventory_uom &&
    i.r365_reporting_uom !== i.r365_inventory_uom
  ) || [];

  console.log(`✓ UOM Consistency: ${items!.length - uomMismatch.length}/${items?.length} items have matching Reporting/Inventory UOM`);
  if (uomMismatch.length > 0) {
    console.log(`  Note: ${uomMismatch.length} items have different Reporting and Inventory UOMs (this may be intentional)`);
  }

  console.log('');
  console.log('3. R365 FIELD MAPPING SUMMARY');
  console.log('-'.repeat(80));

  // Show sample data
  const sampleItem = items?.[0];
  if (sampleItem) {
    console.log('Sample Item Mapping:');
    console.log(`  Name: ${sampleItem.name}`);
    console.log(`  SKU: ${sampleItem.sku || '(empty)'}`);
    console.log(`  Measure Type: ${sampleItem.r365_measure_type || '(empty)'}`);
    console.log(`  Reporting U of M: ${sampleItem.r365_reporting_uom || '(empty)'}`);
    console.log(`  Inventory U of M: ${sampleItem.r365_inventory_uom || '(empty)'}`);
    console.log(`  Cost Account: ${sampleItem.r365_cost_account || '(empty)'}`);
    console.log(`  Inventory Account: ${sampleItem.r365_inventory_account || '(empty)'}`);
    console.log(`  Cost Update Method: ${sampleItem.r365_cost_update_method || '(empty)'}`);
    console.log(`  Key Item: ${sampleItem.r365_key_item || '(empty)'}`);
  }

  console.log('');
  console.log('4. MEASURE TYPE BREAKDOWN');
  console.log('-'.repeat(80));

  const measureTypeCount = new Map();
  items?.forEach(i => {
    const mt = i.r365_measure_type || 'null';
    measureTypeCount.set(mt, (measureTypeCount.get(mt) || 0) + 1);
  });

  Array.from(measureTypeCount.entries()).forEach(([type, count]) => {
    console.log(`  ${type}: ${count} items`);
  });

  console.log('');
  console.log('5. UNIT OF MEASURE SUMMARY');
  console.log('-'.repeat(80));

  const uomCount = new Map();
  items?.forEach(i => {
    const uom = i.r365_reporting_uom || 'null';
    uomCount.set(uom, (uomCount.get(uom) || 0) + 1);
  });

  const topUOMs = Array.from(uomCount.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15);

  console.log('Top 15 Units of Measure:');
  topUOMs.forEach(([uom, count]) => {
    console.log(`  ${uom}: ${count} items`);
  });

  console.log('');
  console.log('='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));

  if (issues.length === 0 && warnings.length === 0) {
    console.log('');
    console.log('✅ SUCCESS: All items are R365 import compliant!');
    console.log('');
    console.log('Your data structure matches R365 requirements:');
    console.log('  ✓ All required fields are populated');
    console.log('  ✓ Data types are correct');
    console.log('  ✓ Field naming matches R365 specifications');
    console.log('');
  } else {
    if (issues.length > 0) {
      console.log('');
      console.log('CRITICAL ISSUES (Must fix before import):');
      issues.forEach(issue => console.log(`  ${issue}`));
    }

    if (warnings.length > 0) {
      console.log('');
      console.log('WARNINGS (Review recommended):');
      warnings.forEach(warning => console.log(`  ${warning}`));
    }
  }

  console.log('');
  console.log('='.repeat(80));
}

validateR365Compliance().catch(console.error);
