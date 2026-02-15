/**
 * Apply High-Confidence UOM Changes
 * Updates items based on thorough FP&A review (DEFINITE + HIGH confidence only)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ReviewItem {
  confidence: string;
  sku: string;
  itemName: string;
  category: string;
  currentMeasureType: string;
  currentBaseUom: string;
  recommendedMeasureType: string;
  recommendedBaseUom: string;
  packAnalysis: string;
  industryStandard: string;
  reasoning: string;
}

async function applyHighConfidenceChanges(dryRun: boolean = true) {
  console.log('🔧 Applying High-Confidence UOM Changes\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Read CSV
  const csvContent = fs.readFileSync('THOROUGH_FPA_REVIEW.csv', 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',');

  const reviewItems: ReviewItem[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // Parse CSV line (handle quoted fields)
    const matches = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);
    if (!matches || matches.length < 11) continue;

    const row = matches.map(m => m.replace(/^"|"$/g, ''));

    reviewItems.push({
      confidence: row[0],
      sku: row[1],
      itemName: row[2],
      category: row[3],
      currentMeasureType: row[4],
      currentBaseUom: row[5],
      recommendedMeasureType: row[6],
      recommendedBaseUom: row[7],
      packAnalysis: row[8],
      industryStandard: row[9],
      reasoning: row[10]
    });
  }

  console.log(`Loaded ${reviewItems.length} items from review\n`);

  // Filter for DEFINITE and HIGH confidence only
  const highConfidence = reviewItems.filter(
    item => item.confidence === 'DEFINITE' || item.confidence === 'HIGH'
  );

  console.log('═══════════════════════════════════════════════════════');
  console.log('CHANGE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Items to update: ${highConfidence.length}`);
  console.log(`  DEFINITE: ${reviewItems.filter(i => i.confidence === 'DEFINITE').length}`);
  console.log(`  HIGH: ${reviewItems.filter(i => i.confidence === 'HIGH').length}\n`);

  // Group by change type
  const changesByType = new Map<string, number>();
  highConfidence.forEach(item => {
    const key = `${item.currentMeasureType} (${item.currentBaseUom}) → ${item.recommendedMeasureType} (${item.recommendedBaseUom})`;
    changesByType.set(key, (changesByType.get(key) || 0) + 1);
  });

  console.log('Changes by type:');
  changesByType.forEach((count, type) => {
    console.log(`  ${type}: ${count} items`);
  });
  console.log();

  // Show sample changes
  console.log('Sample changes (first 20):');
  highConfidence.slice(0, 20).forEach(item => {
    console.log(`  ${item.sku} - ${item.itemName}`);
    console.log(`    ${item.currentMeasureType} (${item.currentBaseUom}) → ${item.recommendedMeasureType} (${item.recommendedBaseUom})`);
  });
  console.log();

  if (!dryRun) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  APPLYING UPDATES');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get org ID
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .ilike('name', '%wood%')
      .single();

    if (!org) {
      console.error('❌ Organization not found');
      return;
    }

    let updated = 0;
    let failed = 0;
    const failures: Array<{ sku: string; error: string }> = [];

    for (const item of highConfidence) {
      // Get item by SKU
      const { data: dbItem, error: fetchError } = await supabase
        .from('items')
        .select('id')
        .eq('organization_id', org.id)
        .eq('sku', item.sku)
        .single();

      if (fetchError || !dbItem) {
        console.error(`❌ Item not found: ${item.sku}`);
        failed++;
        failures.push({ sku: item.sku, error: 'Item not found' });
        continue;
      }

      // Update item
      const { error: updateError } = await supabase
        .from('items')
        .update({
          r365_measure_type: item.recommendedMeasureType,
          base_uom: item.recommendedBaseUom,
          r365_reporting_uom: item.recommendedBaseUom,
          r365_inventory_uom: item.recommendedBaseUom,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbItem.id);

      if (updateError) {
        console.error(`❌ Failed: ${item.sku} - ${updateError.message}`);
        failed++;
        failures.push({ sku: item.sku, error: updateError.message });
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`  ✅ Updated ${updated}/${highConfidence.length} items...`);
        }
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}\n`);

    if (failures.length > 0) {
      console.log('Failed items:');
      failures.slice(0, 10).forEach(f => {
        console.log(`  ${f.sku}: ${f.error}`);
      });
      if (failures.length > 10) {
        console.log(`  ... and ${failures.length - 10} more\n`);
      }
    }

    console.log('Impact:');
    console.log('  ✅ Recipe conversions will now work correctly');
    console.log('  ✅ Base UOM matches measure type for R365');
    console.log('  ✅ Weight items tracked in lb, volume in oz/gal, count in ea');
    console.log('  ✅ Conversions enable recipes to use different UOMs\n');

    console.log('Next steps:');
    console.log('  1. Review 230 MEDIUM confidence items in THOROUGH_FPA_REVIEW.csv');
    console.log('  2. Validate with ops team before applying MEDIUM changes');
    console.log('  3. Regenerate R365 vendor items export\n');

  } else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('This will:');
    console.log(`  - Update ${highConfidence.length} items`);
    console.log('  - Change r365_measure_type to match item characteristics');
    console.log('  - Update base_uom to align with measure type');
    console.log('  - Update r365_reporting_uom and r365_inventory_uom to match');
    console.log('  - Enable proper recipe conversions in R365\n');

    console.log('Key changes:');
    console.log('  - Bulk dry goods (flour, sugar, salt) → Weight (lb)');
    console.log('  - Liquid dairy/beverages → Volume (gal/oz)');
    console.log('  - Count-based produce (onions 48 ct) → Each (ea)');
    console.log('  - Weight-based produce (chives 1# lb) → Weight (lb)\n');

    console.log('Safety:');
    console.log('  ✅ Only DEFINITE + HIGH confidence (backed by pack config)');
    console.log('  ✅ 230 MEDIUM confidence items excluded (need review)');
    console.log('  ✅ Based on your actual purchasing patterns\n');

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/apply-high-confidence-uom-changes.ts --live\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
applyHighConfidenceChanges(!isLive).catch(console.error);
