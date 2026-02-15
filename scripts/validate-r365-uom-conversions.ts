/**
 * Validate R365 UOM Conversions
 * Checks for common issues in UOM configurations
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  sku: string;
  name: string;
  issue: string;
  recommendation: string;
}

async function validateUOMConversions() {
  console.log('🔍 Validating R365 UOM Conversions\n');

  const issues: ValidationIssue[] = [];

  // Fetch all items with pack configs
  const { data: items, error } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      category,
      base_uom,
      r365_measure_type,
      r365_reporting_uom,
      r365_inventory_uom,
      item_pack_configurations(
        id,
        pack_type,
        units_per_pack,
        unit_size,
        unit_size_uom,
        conversion_factor
      )
    `)
    .eq('is_active', true);

  if (error || !items) {
    console.error('❌ Error fetching items:', error);
    return;
  }

  console.log(`Checking ${items.length} items...\n`);

  for (const item of items) {
    const packs = (item as any).item_pack_configurations || [];

    // Check 1: Missing measure type
    if (!item.r365_measure_type) {
      issues.push({
        severity: 'warning',
        sku: item.sku,
        name: item.name,
        issue: 'No measure type set',
        recommendation: 'Set r365_measure_type to Weight, Volume, or Each'
      });
    }

    // Check 2: Measure type doesn't match base UOM
    if (item.r365_measure_type && item.base_uom) {
      const measureType = item.r365_measure_type.toLowerCase();
      const baseUom = item.base_uom.toLowerCase();

      const volumeUnits = ['oz', 'ml', 'l', 'gal', 'qt', 'pt'];
      const weightUnits = ['lb', 'oz', 'kg', 'g'];
      const eachUnits = ['ea', 'each', 'unit', 'count'];

      const isVolume = volumeUnits.some(u => baseUom.includes(u));
      const isWeight = weightUnits.some(u => baseUom.includes(u));
      const isEach = eachUnits.some(u => baseUom.includes(u));

      if (measureType === 'volume' && !isVolume) {
        issues.push({
          severity: 'error',
          sku: item.sku,
          name: item.name,
          issue: `Measure type is Volume but base UOM is "${baseUom}"`,
          recommendation: `Change base_uom to oz, mL, or L, or change measure type`
        });
      } else if (measureType === 'weight' && !isWeight) {
        issues.push({
          severity: 'error',
          sku: item.sku,
          name: item.name,
          issue: `Measure type is Weight but base UOM is "${baseUom}"`,
          recommendation: `Change base_uom to oz, lb, or kg, or change measure type`
        });
      } else if (measureType === 'each' && !isEach) {
        issues.push({
          severity: 'warning',
          sku: item.sku,
          name: item.name,
          issue: `Measure type is Each but base UOM is "${baseUom}"`,
          recommendation: `For "Each" items, base_uom should be "ea" or "each"`
        });
      }
    }

    // Check 3: Pack configurations issues
    for (const pack of packs) {
      // Zero or negative conversion factor
      if (!pack.conversion_factor || pack.conversion_factor <= 0) {
        issues.push({
          severity: 'error',
          sku: item.sku,
          name: item.name,
          issue: `Pack ${pack.pack_type} has invalid conversion factor: ${pack.conversion_factor}`,
          recommendation: `Recalculate conversion factor or check pack configuration`
        });
      }

      // Suspicious "Each" items with very small conversions
      if (item.r365_measure_type === 'Each' && pack.conversion_factor < 1 && pack.conversion_factor > 0) {
        issues.push({
          severity: 'warning',
          sku: item.sku,
          name: item.name,
          issue: `"Each" item has fractional conversion factor: ${pack.conversion_factor}`,
          recommendation: `For countable items, conversion should be whole numbers (1, 6, 12, etc.)`
        });
      }

      // Volume items measured in "oz" - ambiguous (could be weight or volume)
      if (item.base_uom === 'oz' && !item.r365_measure_type) {
        issues.push({
          severity: 'info',
          sku: item.sku,
          name: item.name,
          issue: 'Base UOM is "oz" which is ambiguous (weight vs volume)',
          recommendation: `Specify measure type as Weight or Volume, and consider using "fl oz" for volume`
        });
      }
    }

    // Check 4: Category-specific validations
    if (item.category) {
      const cat = item.category.toLowerCase();

      // Beverages should be Volume
      if (['beer', 'wine', 'liquor', 'spirits'].includes(cat) && item.r365_measure_type !== 'Volume') {
        issues.push({
          severity: 'warning',
          sku: item.sku,
          name: item.name,
          issue: `${item.category} should use Volume measure type`,
          recommendation: `Set r365_measure_type = 'Volume'`
        });
      }

      // Smallwares should be Each
      if (['smallwares', 'supplies', 'disposables'].includes(cat) && item.r365_measure_type !== 'Each') {
        issues.push({
          severity: 'warning',
          sku: item.sku,
          name: item.name,
          issue: `${item.category} should use Each measure type`,
          recommendation: `Set r365_measure_type = 'Each'`
        });
      }
    }

    // Check 5: Missing pack configurations
    if (packs.length === 0) {
      issues.push({
        severity: 'warning',
        sku: item.sku,
        name: item.name,
        issue: 'No pack configurations',
        recommendation: 'Add at least one pack configuration to enable purchasing'
      });
    }
  }

  // Report results
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 VALIDATION RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const info = issues.filter(i => i.severity === 'info');

  console.log(`✅ Items Checked: ${items.length}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`ℹ️  Info: ${info.length}\n`);

  if (errors.length === 0 && warnings.length === 0 && info.length === 0) {
    console.log('🎉 All UOM conversions look good!\n');
    return;
  }

  // Show errors first
  if (errors.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`❌ ERRORS (${errors.length}) - Must Fix Before Import`);
    console.log('═══════════════════════════════════════════════════════\n');

    errors.slice(0, 20).forEach(issue => {
      console.log(`SKU: ${issue.sku} - ${issue.name}`);
      console.log(`  Issue: ${issue.issue}`);
      console.log(`  Fix: ${issue.recommendation}\n`);
    });

    if (errors.length > 20) {
      console.log(`... and ${errors.length - 20} more errors\n`);
    }
  }

  // Show warnings
  if (warnings.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`⚠️  WARNINGS (${warnings.length}) - Should Review`);
    console.log('═══════════════════════════════════════════════════════\n');

    warnings.slice(0, 10).forEach(issue => {
      console.log(`SKU: ${issue.sku} - ${issue.name}`);
      console.log(`  Issue: ${issue.issue}`);
      console.log(`  Suggestion: ${issue.recommendation}\n`);
    });

    if (warnings.length > 10) {
      console.log(`... and ${warnings.length - 10} more warnings\n`);
    }
  }

  // Show info
  if (info.length > 0 && info.length <= 10) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`ℹ️  INFO (${info.length}) - For Your Awareness`);
    console.log('═══════════════════════════════════════════════════════\n');

    info.forEach(issue => {
      console.log(`SKU: ${issue.sku} - ${issue.name}`);
      console.log(`  Note: ${issue.issue}`);
      console.log(`  Suggestion: ${issue.recommendation}\n`);
    });
  }

  // Summary recommendations
  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════\n');

  if (errors.length > 0) {
    console.log('1. ❌ Fix all errors before importing to R365');
    console.log('   Run SQL updates to correct measure types and conversion factors\n');
  }

  if (warnings.length > 0) {
    console.log('2. ⚠️  Review warnings - these may cause issues in R365');
    console.log('   Most common: measure type doesn\'t match category\n');
  }

  console.log('3. ✅ After fixing, run this validation again');
  console.log('4. ✅ Generate fresh export: npx tsx scripts/generate-r365-uom-guide.ts');
  console.log('5. ✅ Import to R365\n');
}

validateUOMConversions().catch(console.error);
