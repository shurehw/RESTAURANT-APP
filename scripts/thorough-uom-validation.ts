/**
 * Thorough UOM Validation & Fix
 * Senior FP&A level analysis of every item and purchase item
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ItemAnalysis {
  id: string;
  sku: string;
  name: string;
  category: string;
  measureType: string;
  currentBaseUom: string;
  proposedBaseUom: string;
  packConfigs: any[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW';
  reasoning: string;
  warnings: string[];
}

function determineCategoryExpectedUom(category: string, itemName: string, measureType: string): {
  expectedUom: string;
  reasoning: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
} {
  const cat = category?.toLowerCase() || '';
  const name = itemName?.toLowerCase() || '';

  // BEVERAGES - Should be "ea" (bottles/cans)
  if (['wine', 'beer', 'liquor', 'spirits', 'liqueur'].includes(cat)) {
    return {
      expectedUom: 'ea',
      reasoning: 'Beverages tracked by bottle/can count',
      confidence: 'HIGH'
    };
  }

  // DAIRY - Depends on packaging
  if (cat.includes('dairy')) {
    if (name.includes('milk') || name.includes('cream') || name.includes('half and half')) {
      return {
        expectedUom: 'gal', // Or oz for small containers
        reasoning: 'Liquid dairy tracked by volume',
        confidence: 'MEDIUM'
      };
    } else if (name.includes('butter') || name.includes('cheese')) {
      return {
        expectedUom: 'lb',
        reasoning: 'Solid dairy tracked by weight',
        confidence: 'MEDIUM'
      };
    }
    return {
      expectedUom: 'ea',
      reasoning: 'Dairy containers tracked by unit',
      confidence: 'MEDIUM'
    };
  }

  // MEAT & SEAFOOD - Weight based
  if (['meat', 'seafood'].includes(cat)) {
    if (name.includes('caviar') || name.includes('oyster')) {
      return {
        expectedUom: 'ea',
        reasoning: 'High-end proteins often tracked by unit',
        confidence: 'MEDIUM'
      };
    }
    return {
      expectedUom: 'lb',
      reasoning: 'Meat/seafood tracked by weight',
      confidence: 'HIGH'
    };
  }

  // PRODUCE - Often each (bunches, heads, etc.)
  if (cat.includes('produce')) {
    if (name.includes('lettuce') || name.includes('cilantro') || name.includes('parsley') ||
        name.includes('basil') || name.includes('celery') || name.includes('avocado')) {
      return {
        expectedUom: 'ea',
        reasoning: 'Produce tracked by bunch/head/piece',
        confidence: 'HIGH'
      };
    } else if (name.includes('carrot') || name.includes('potato') || name.includes('onion')) {
      return {
        expectedUom: 'lb',
        reasoning: 'Root vegetables typically tracked by weight',
        confidence: 'MEDIUM'
      };
    }
    return {
      expectedUom: 'ea',
      reasoning: 'Produce typically tracked by unit',
      confidence: 'MEDIUM'
    };
  }

  // PANTRY/GROCERY - Depends on type
  if (['pantry', 'grocery'].includes(cat)) {
    if (name.includes('oil') || name.includes('vinegar') || name.includes('sauce')) {
      return {
        expectedUom: 'oz',
        reasoning: 'Liquid pantry items tracked by volume',
        confidence: 'MEDIUM'
      };
    } else if (name.includes('flour') || name.includes('sugar') || name.includes('rice')) {
      return {
        expectedUom: 'lb',
        reasoning: 'Dry goods tracked by weight',
        confidence: 'MEDIUM'
      };
    }
    return {
      expectedUom: 'ea',
      reasoning: 'Packaged goods tracked by unit',
      confidence: 'MEDIUM'
    };
  }

  // BAR CONSUMABLES - Usually "ea"
  if (cat.includes('bar') || cat.includes('packaging')) {
    return {
      expectedUom: 'ea',
      reasoning: 'Bar supplies/packaging tracked by unit',
      confidence: 'HIGH'
    };
  }

  // BAKERY - Usually "ea"
  if (cat.includes('bakery')) {
    return {
      expectedUom: 'ea',
      reasoning: 'Baked goods tracked by unit',
      confidence: 'HIGH'
    };
  }

  // FOOD (generic) - Depends on measure type
  if (cat === 'food') {
    if (measureType === 'Each') {
      return {
        expectedUom: 'ea',
        reasoning: 'Each measure type requires "ea" UOM',
        confidence: 'HIGH'
      };
    } else if (measureType === 'Weight') {
      return {
        expectedUom: 'lb',
        reasoning: 'Weight measure type requires weight UOM',
        confidence: 'HIGH'
      };
    } else if (measureType === 'Volume') {
      return {
        expectedUom: 'oz',
        reasoning: 'Volume measure type requires volume UOM',
        confidence: 'HIGH'
      };
    }
  }

  // DEFAULT - Use measure type to determine
  if (measureType === 'Each') {
    return {
      expectedUom: 'ea',
      reasoning: 'Each measure type requires "ea" UOM',
      confidence: 'HIGH'
    };
  } else if (measureType === 'Weight') {
    return {
      expectedUom: 'lb',
      reasoning: 'Weight measure type requires weight UOM',
      confidence: 'HIGH'
    };
  } else if (measureType === 'Volume') {
    return {
      expectedUom: 'oz',
      reasoning: 'Volume measure type requires volume UOM',
      confidence: 'HIGH'
    };
  }

  return {
    expectedUom: 'ea',
    reasoning: 'Default to "ea" for unknown categories',
    confidence: 'LOW'
  };
}

function validatePackConfigAlignment(
  proposedUom: string,
  packConfigs: any[],
  measureType: string
): { aligned: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (packConfigs.length === 0) {
    warnings.push('No pack configurations found');
    return { aligned: false, warnings };
  }

  packConfigs.forEach((pack, idx) => {
    const unitSizeUom = pack.unit_size_uom?.toLowerCase();
    const unitsPerPack = pack.units_per_pack;
    const conversionFactor = pack.conversion_factor;

    // Check if pack config makes sense with proposed UOM
    if (measureType === 'Each') {
      if (proposedUom === 'ea') {
        // For Each measure type, units_per_pack should be the count
        if (unitsPerPack < 1) {
          warnings.push(`Pack ${idx + 1}: units_per_pack (${unitsPerPack}) seems incorrect for Each measure type`);
        }
      }
    } else if (measureType === 'Volume') {
      // For Volume measure type, check if unit_size_uom is volume-based
      const volumeUoms = ['ml', 'l', 'oz', 'gal', 'qt'];
      if (unitSizeUom && !volumeUoms.includes(unitSizeUom)) {
        warnings.push(`Pack ${idx + 1}: unit_size_uom (${unitSizeUom}) doesn't match Volume measure type`);
      }
    } else if (measureType === 'Weight') {
      // For Weight measure type, check if unit_size_uom is weight-based
      const weightUoms = ['lb', 'kg', 'g', 'oz'];
      if (unitSizeUom && !weightUoms.includes(unitSizeUom)) {
        warnings.push(`Pack ${idx + 1}: unit_size_uom (${unitSizeUom}) doesn't match Weight measure type`);
      }
    }

    // Check for suspicious conversion factors
    if (measureType === 'Each' && conversionFactor !== unitsPerPack) {
      warnings.push(`Pack ${idx + 1}: conversion_factor (${conversionFactor}) != units_per_pack (${unitsPerPack}) for Each measure type`);
    }
  });

  return {
    aligned: warnings.length === 0,
    warnings
  };
}

async function thoroughUOMValidation(dryRun: boolean = true) {
  console.log('🔍 THOROUGH UOM VALIDATION & FIX\n');
  console.log('📊 Senior FP&A Level Analysis\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all items with pack configurations
  console.log('Fetching all items with pack configurations...');

  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        id, sku, name, category, base_uom, r365_measure_type,
        r365_reporting_uom, r365_inventory_uom,
        item_pack_configurations(
          pack_type, units_per_pack, unit_size, unit_size_uom, conversion_factor
        )
      `)
      .eq('organization_id', org!.id)
      .eq('is_active', true)
      .range(from, from + batchSize - 1);

    if (error || !items || items.length === 0) break;

    allItems = allItems.concat(items);
    from += batchSize;

    if (items.length < batchSize) break;
  }

  console.log(`Total Items: ${allItems.length}\n`);
  console.log('Analyzing each item...\n');

  // Analyze each item
  const analyses: ItemAnalysis[] = [];
  const byConfidence = {
    HIGH: [] as ItemAnalysis[],
    MEDIUM: [] as ItemAnalysis[],
    LOW: [] as ItemAnalysis[],
    NEEDS_REVIEW: [] as ItemAnalysis[]
  };

  allItems.forEach((item, idx) => {
    if ((idx + 1) % 500 === 0) {
      console.log(`  Analyzed ${idx + 1}/${allItems.length} items...`);
    }

    const measureType = item.r365_measure_type;
    const currentUom = item.base_uom;
    const packConfigs = item.item_pack_configurations || [];

    // Determine expected UOM based on category
    const expected = determineCategoryExpectedUom(item.category, item.name, measureType);

    // Validate pack configuration alignment
    const validation = validatePackConfigAlignment(expected.expectedUom, packConfigs, measureType);

    // Determine if change is needed
    if (currentUom === expected.expectedUom) {
      // Already correct, skip
      return;
    }

    // Determine overall confidence
    let overallConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NEEDS_REVIEW';
    if (expected.confidence === 'HIGH' && validation.aligned) {
      overallConfidence = 'HIGH';
    } else if (expected.confidence === 'MEDIUM' && validation.aligned) {
      overallConfidence = 'MEDIUM';
    } else if (validation.warnings.length > 2) {
      overallConfidence = 'NEEDS_REVIEW';
    } else if (expected.confidence === 'LOW') {
      overallConfidence = 'LOW';
    } else {
      overallConfidence = 'MEDIUM';
    }

    const analysis: ItemAnalysis = {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      measureType,
      currentBaseUom: currentUom,
      proposedBaseUom: expected.expectedUom,
      packConfigs,
      confidence: overallConfidence,
      reasoning: expected.reasoning,
      warnings: validation.warnings
    };

    analyses.push(analysis);
    byConfidence[overallConfidence].push(analysis);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('ANALYSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total items analyzed: ${allItems.length}`);
  console.log(`Items needing UOM changes: ${analyses.length}\n`);

  console.log('By Confidence Level:');
  console.log(`  HIGH confidence: ${byConfidence.HIGH.length} items ✅`);
  console.log(`  MEDIUM confidence: ${byConfidence.MEDIUM.length} items ⚠️`);
  console.log(`  LOW confidence: ${byConfidence.LOW.length} items ⚠️⚠️`);
  console.log(`  NEEDS REVIEW: ${byConfidence.NEEDS_REVIEW.length} items ❌\n`);

  // Show samples by confidence
  console.log('═══════════════════════════════════════════════════════');
  console.log('HIGH CONFIDENCE CHANGES (First 20)');
  console.log('═══════════════════════════════════════════════════════\n');

  byConfidence.HIGH.slice(0, 20).forEach(a => {
    console.log(`${a.sku} - ${a.name}`);
    console.log(`  Category: ${a.category} | Measure Type: ${a.measureType}`);
    console.log(`  Change: "${a.currentBaseUom}" → "${a.proposedBaseUom}"`);
    console.log(`  Reasoning: ${a.reasoning}`);
    console.log();
  });

  if (byConfidence.MEDIUM.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('MEDIUM CONFIDENCE CHANGES (First 10)');
    console.log('═══════════════════════════════════════════════════════\n');

    byConfidence.MEDIUM.slice(0, 10).forEach(a => {
      console.log(`${a.sku} - ${a.name}`);
      console.log(`  Category: ${a.category} | Measure Type: ${a.measureType}`);
      console.log(`  Change: "${a.currentBaseUom}" → "${a.proposedBaseUom}"`);
      console.log(`  Reasoning: ${a.reasoning}`);
      if (a.warnings.length > 0) {
        console.log(`  Warnings: ${a.warnings.join(', ')}`);
      }
      console.log();
    });
  }

  if (byConfidence.NEEDS_REVIEW.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  ITEMS NEEDING MANUAL REVIEW');
    console.log('═══════════════════════════════════════════════════════\n');

    byConfidence.NEEDS_REVIEW.forEach(a => {
      console.log(`${a.sku} - ${a.name}`);
      console.log(`  Category: ${a.category} | Measure Type: ${a.measureType}`);
      console.log(`  Current: "${a.currentBaseUom}" | Proposed: "${a.proposedBaseUom}"`);
      console.log(`  Warnings: ${a.warnings.join(', ')}`);
      console.log();
    });
  }

  // Export detailed report
  const csvLines = ['SKU,Item Name,Category,Measure Type,Current UOM,Proposed UOM,Confidence,Reasoning,Warnings'];
  analyses.forEach(a => {
    csvLines.push([
      `"${a.sku}"`,
      `"${a.name}"`,
      `"${a.category}"`,
      `"${a.measureType}"`,
      `"${a.currentBaseUom}"`,
      `"${a.proposedBaseUom}"`,
      `"${a.confidence}"`,
      `"${a.reasoning}"`,
      `"${a.warnings.join('; ')}"`
    ].join(','));
  });

  fs.writeFileSync('UOM_VALIDATION_REPORT.csv', csvLines.join('\n'));
  console.log('\n✅ Detailed report exported to: UOM_VALIDATION_REPORT.csv\n');

  // Apply changes (HIGH and MEDIUM confidence only)
  const toApply = [...byConfidence.HIGH, ...byConfidence.MEDIUM];

  if (!dryRun && toApply.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  APPLYING HIGH & MEDIUM CONFIDENCE CHANGES');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Updating ${toApply.length} items (skipping ${byConfidence.LOW.length + byConfidence.NEEDS_REVIEW.length} that need review)...\n`);

    let updated = 0;
    let failed = 0;

    for (const item of toApply) {
      const { error } = await supabase
        .from('items')
        .update({
          base_uom: item.proposedBaseUom,
          r365_reporting_uom: item.proposedBaseUom,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) {
        console.error(`❌ Failed: ${item.sku} - ${error.message}`);
        failed++;
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`  ✅ Updated ${updated}/${toApply.length} items...`);
        }
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped for review: ${byConfidence.LOW.length + byConfidence.NEEDS_REVIEW.length}\n`);

  } else if (toApply.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE - READY TO APPLY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Will update ${toApply.length} items:`);
    console.log(`  ✅ HIGH confidence: ${byConfidence.HIGH.length}`);
    console.log(`  ⚠️  MEDIUM confidence: ${byConfidence.MEDIUM.length}`);
    console.log(`  ⏭️  Will skip: ${byConfidence.LOW.length + byConfidence.NEEDS_REVIEW.length} (need manual review)\n`);

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/thorough-uom-validation.ts --live\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
thoroughUOMValidation(!isLive).catch(console.error);
