/**
 * Thorough FP&A Review - Deep Analysis
 * Apply restaurant industry knowledge + pack config analysis + cross-referencing
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ItemDecision {
  id: string;
  sku: string;
  name: string;
  category: string;
  currentMeasureType: string;
  currentBaseUom: string;
  recommendedMeasureType: string;
  recommendedBaseUom: string;
  confidence: 'DEFINITE' | 'HIGH' | 'MEDIUM' | 'REQUIRES_REVIEW';
  reasoning: string[];
  packAnalysis: string;
  industryStandard: string;
  conversionNotes: string;
}

function analyzePackConfiguration(packs: any[]): {
  likelyType: 'WEIGHT' | 'COUNT' | 'VOLUME' | 'UNCLEAR';
  confidence: number;
  reasoning: string;
} {
  if (packs.length === 0) {
    return { likelyType: 'UNCLEAR', confidence: 0, reasoning: 'No pack configuration' };
  }

  const primaryPack = packs[0];
  const unitSizeUom = primaryPack.unit_size_uom?.toLowerCase();
  const unitsPerPack = primaryPack.units_per_pack;
  const unitSize = primaryPack.unit_size;
  const conversionFactor = primaryPack.conversion_factor;

  let likelyType: 'WEIGHT' | 'COUNT' | 'VOLUME' | 'UNCLEAR' = 'UNCLEAR';
  let confidence = 0.5;
  let reasoning = '';

  // Analyze unit_size_uom
  const weightUoms = ['lb', '#', 'kg', 'g', 'oz'];
  const volumeUoms = ['ml', 'l', 'gal', 'qt', 'oz', 'fl oz'];
  const countUoms = ['ea', 'each', 'ct', 'bunch', 'head', 'piece'];

  if (weightUoms.includes(unitSizeUom)) {
    // If unit size is in weight AND conversion factor suggests weight accumulation
    if (conversionFactor && conversionFactor === unitSize * unitsPerPack) {
      likelyType = 'WEIGHT';
      confidence = 0.9;
      reasoning = `Pack: ${unitsPerPack}x ${unitSize}${unitSizeUom} = ${conversionFactor}${unitSizeUom} total. Weight-based.`;
    } else if (unitsPerPack === 1 && unitSize) {
      likelyType = 'WEIGHT';
      confidence = 0.8;
      reasoning = `Single unit of ${unitSize}${unitSizeUom}. Weight-based.`;
    } else {
      likelyType = 'COUNT';
      confidence = 0.7;
      reasoning = `Multiple units (${unitsPerPack}) of ${unitSize}${unitSizeUom}. Count-based with weight per unit.`;
    }
  } else if (volumeUoms.includes(unitSizeUom)) {
    if (conversionFactor && conversionFactor > unitsPerPack) {
      likelyType = 'VOLUME';
      confidence = 0.9;
      reasoning = `Pack: ${unitsPerPack}x ${unitSize}${unitSizeUom}. Volume accumulates to ${conversionFactor}. Volume-based.`;
    } else {
      likelyType = 'COUNT';
      confidence = 0.8;
      reasoning = `Packaged volume items (${unitsPerPack} containers). Count-based.`;
    }
  } else if (countUoms.includes(unitSizeUom) || unitsPerPack > 1) {
    likelyType = 'COUNT';
    confidence = 0.9;
    reasoning = `Pack contains ${unitsPerPack} units. Count-based.`;
  }

  return { likelyType, confidence, reasoning };
}

function getIndustryStandard(category: string, itemName: string): {
  measureType: 'Each' | 'Weight' | 'Volume';
  baseUom: string;
  reasoning: string;
  confidence: number;
} {
  const name = itemName.toLowerCase();
  const cat = category?.toLowerCase() || '';

  // BEVERAGES - Always count by bottle/can
  if (['wine', 'beer', 'liquor', 'spirits', 'liqueur'].includes(cat)) {
    return {
      measureType: 'Each',
      baseUom: 'ea',
      reasoning: 'Industry standard: Beverages tracked by bottle/can, recipes use oz (conversion via bottle size)',
      confidence: 1.0
    };
  }

  // MEAT & SEAFOOD
  if (cat === 'meat' || cat === 'seafood') {
    // Portioned items (count-based)
    if (name.includes('portion') || name.includes('patty') || name.includes('piece') ||
        name.match(/\d+\s*oz/) || name.includes('filet')) {
      return {
        measureType: 'Each',
        baseUom: 'ea',
        reasoning: 'Industry standard: Pre-portioned proteins tracked by count, recipes use count or weight',
        confidence: 0.9
      };
    }
    // High-end items (count-based)
    if (name.includes('caviar') || name.includes('oyster') || name.includes('scallop')) {
      return {
        measureType: 'Each',
        baseUom: 'ea',
        reasoning: 'Industry standard: Premium seafood tracked by unit/jar',
        confidence: 0.9
      };
    }
    // Bulk/unportioned (weight-based)
    return {
      measureType: 'Weight',
      baseUom: 'lb',
      reasoning: 'Industry standard: Bulk protein tracked by weight',
      confidence: 0.8
    };
  }

  // PRODUCE
  if (cat === 'produce') {
    // Items sold by bunch/head (count-based)
    if (name.includes('lettuce') || name.includes('cilantro') || name.includes('parsley') ||
        name.includes('basil') || name.includes('celery') || name.includes('bunch')) {
      return {
        measureType: 'Each',
        baseUom: 'ea',
        reasoning: 'Industry standard: Herbs/leafy greens tracked by bunch/head',
        confidence: 0.9
      };
    }
    // Items with count indicator
    if (name.match(/\d+\s*ct/) || name.includes('avocado') || name.includes('tomato')) {
      return {
        measureType: 'Each',
        baseUom: 'ea',
        reasoning: 'Industry standard: Countable produce tracked by unit',
        confidence: 0.9
      };
    }
    // Root vegetables (often weight-based)
    if (name.includes('potato') || name.includes('onion') || name.includes('carrot')) {
      return {
        measureType: 'Weight',
        baseUom: 'lb',
        reasoning: 'Industry standard: Root vegetables typically tracked by weight',
        confidence: 0.6 // Lower confidence - could be count-based depending on size
      };
    }
  }

  // DAIRY
  if (cat === 'dairy') {
    // Liquid dairy (volume-based)
    if (name.includes('milk') || name.includes('cream') || name.includes('buttermilk')) {
      return {
        measureType: 'Volume',
        baseUom: 'gal',
        reasoning: 'Industry standard: Liquid dairy tracked by volume',
        confidence: 0.9
      };
    }
    // Solid dairy (weight-based)
    if (name.includes('cheese') || name.includes('butter')) {
      return {
        measureType: 'Weight',
        baseUom: 'lb',
        reasoning: 'Industry standard: Solid dairy tracked by weight',
        confidence: 0.9
      };
    }
    // Yogurt/containers (count-based)
    return {
      measureType: 'Each',
      baseUom: 'ea',
      reasoning: 'Industry standard: Containerized dairy tracked by unit',
      confidence: 0.7
    };
  }

  // PANTRY/GROCERY
  if (cat === 'pantry' || cat === 'grocery') {
    // Liquids (volume-based)
    if (name.includes('oil') || name.includes('vinegar') || name.includes('sauce') ||
        name.includes('syrup')) {
      return {
        measureType: 'Volume',
        baseUom: 'oz',
        reasoning: 'Industry standard: Liquid pantry items tracked by volume',
        confidence: 0.8
      };
    }
    // Dry goods (weight-based)
    if (name.includes('flour') || name.includes('sugar') || name.includes('salt') ||
        name.includes('rice')) {
      return {
        measureType: 'Weight',
        baseUom: 'lb',
        reasoning: 'Industry standard: Bulk dry goods tracked by weight',
        confidence: 0.9
      };
    }
    // Packaged goods (count-based)
    return {
      measureType: 'Each',
      baseUom: 'ea',
      reasoning: 'Industry standard: Packaged goods tracked by container',
      confidence: 0.7
    };
  }

  // BAKERY (count-based)
  if (cat === 'bakery') {
    return {
      measureType: 'Each',
      baseUom: 'ea',
      reasoning: 'Industry standard: Baked goods tracked by unit',
      confidence: 0.9
    };
  }

  // Default
  return {
    measureType: 'Each',
    baseUom: 'ea',
    reasoning: 'Default: Most food items tracked by unit with weight conversion',
    confidence: 0.3
  };
}

async function thoroughFPAReview() {
  console.log('🔍 THOROUGH FP&A REVIEW\n');
  console.log('Deep analysis with industry standards + pack config validation\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get ALL items (not just food)
  console.log('Fetching all items...');

  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        id, sku, name, category, base_uom, r365_measure_type,
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

  console.log(`Total items: ${allItems.length}\n`);
  console.log('Analyzing each item...\n');

  const decisions: ItemDecision[] = [];
  const definite: ItemDecision[] = [];
  const high: ItemDecision[] = [];
  const medium: ItemDecision[] = [];
  const requiresReview: ItemDecision[] = [];

  allItems.forEach((item, idx) => {
    if ((idx + 1) % 500 === 0) {
      console.log(`  Analyzed ${idx + 1}/${allItems.length} items...`);
    }

    const packs = item.item_pack_configurations || [];

    // Analyze pack configuration
    const packAnalysis = analyzePackConfiguration(packs);

    // Get industry standard
    const industry = getIndustryStandard(item.category, item.name);

    // Combine analyses
    const reasoning: string[] = [];
    let recommendedMeasureType = item.r365_measure_type;
    let recommendedBaseUom = item.base_uom;
    let confidence: 'DEFINITE' | 'HIGH' | 'MEDIUM' | 'REQUIRES_REVIEW' = 'MEDIUM';

    // Decision logic
    if (packAnalysis.confidence >= 0.9 && industry.confidence >= 0.9 &&
        packAnalysis.likelyType.toLowerCase() === industry.measureType.toLowerCase().substring(0, packAnalysis.likelyType.length)) {
      // Pack analysis and industry standard agree strongly
      recommendedMeasureType = industry.measureType;
      recommendedBaseUom = industry.baseUom;
      confidence = 'DEFINITE';
      reasoning.push(`✅ Strong agreement: ${industry.reasoning}`);
      reasoning.push(`✅ Pack analysis confirms: ${packAnalysis.reasoning}`);
    } else if (industry.confidence >= 0.9) {
      // Strong industry standard, weaker pack analysis
      recommendedMeasureType = industry.measureType;
      recommendedBaseUom = industry.baseUom;
      confidence = 'HIGH';
      reasoning.push(`✅ Industry standard: ${industry.reasoning}`);
      reasoning.push(`⚠️  Pack analysis: ${packAnalysis.reasoning}`);
    } else if (packAnalysis.confidence >= 0.8) {
      // Strong pack analysis, weaker industry standard
      if (packAnalysis.likelyType === 'WEIGHT') {
        recommendedMeasureType = 'Weight';
        recommendedBaseUom = 'lb';
      } else if (packAnalysis.likelyType === 'VOLUME') {
        recommendedMeasureType = 'Volume';
        recommendedBaseUom = 'oz';
      } else if (packAnalysis.likelyType === 'COUNT') {
        recommendedMeasureType = 'Each';
        recommendedBaseUom = 'ea';
      }
      confidence = 'HIGH';
      reasoning.push(`✅ Pack analysis: ${packAnalysis.reasoning}`);
      reasoning.push(`⚠️  Industry standard: ${industry.reasoning}`);
    } else if (packAnalysis.confidence >= 0.6 || industry.confidence >= 0.6) {
      // Moderate confidence from either source
      recommendedMeasureType = industry.measureType;
      recommendedBaseUom = industry.baseUom;
      confidence = 'MEDIUM';
      reasoning.push(`⚠️  Industry standard: ${industry.reasoning}`);
      reasoning.push(`⚠️  Pack analysis: ${packAnalysis.reasoning}`);
    } else {
      // Low confidence from both
      recommendedMeasureType = item.r365_measure_type;
      recommendedBaseUom = item.base_uom;
      confidence = 'REQUIRES_REVIEW';
      reasoning.push(`❌ Unclear from both industry standard and pack config`);
      reasoning.push(`   Pack: ${packAnalysis.reasoning}`);
      reasoning.push(`   Industry: ${industry.reasoning}`);
    }

    // Check if change is actually needed
    if (item.r365_measure_type === recommendedMeasureType && item.base_uom === recommendedBaseUom) {
      return; // No change needed
    }

    const decision: ItemDecision = {
      id: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      currentMeasureType: item.r365_measure_type,
      currentBaseUom: item.base_uom,
      recommendedMeasureType,
      recommendedBaseUom,
      confidence,
      reasoning,
      packAnalysis: packAnalysis.reasoning,
      industryStandard: industry.reasoning,
      conversionNotes: `Recipe conversions will use ${packs[0]?.unit_size} ${packs[0]?.unit_size_uom} per unit`
    };

    decisions.push(decision);

    if (confidence === 'DEFINITE') definite.push(decision);
    else if (confidence === 'HIGH') high.push(decision);
    else if (confidence === 'MEDIUM') medium.push(decision);
    else requiresReview.push(decision);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('THOROUGH REVIEW RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total items analyzed: ${allItems.length}`);
  console.log(`Items needing changes: ${decisions.length}\n`);

  console.log('By Confidence Level:');
  console.log(`  ✅ DEFINITE (safe to apply): ${definite.length}`);
  console.log(`  ✅ HIGH (very likely correct): ${high.length}`);
  console.log(`  ⚠️  MEDIUM (probably correct): ${medium.length}`);
  console.log(`  ❌ REQUIRES REVIEW: ${requiresReview.length}\n`);

  // Show samples
  if (definite.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('DEFINITE CHANGES (First 30)');
    console.log('═══════════════════════════════════════════════════════\n');

    definite.slice(0, 30).forEach(d => {
      console.log(`${d.sku} - ${d.name}`);
      console.log(`  Current: ${d.currentMeasureType} (${d.currentBaseUom})`);
      console.log(`  Recommended: ${d.recommendedMeasureType} (${d.recommendedBaseUom})`);
      d.reasoning.forEach(r => console.log(`  ${r}`));
      console.log();
    });
  }

  if (requiresReview.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  REQUIRES MANUAL REVIEW (First 30)');
    console.log('═══════════════════════════════════════════════════════\n');

    requiresReview.slice(0, 30).forEach(d => {
      console.log(`${d.sku} - ${d.name}`);
      console.log(`  Current: ${d.currentMeasureType} (${d.currentBaseUom})`);
      console.log(`  Suggested: ${d.recommendedMeasureType} (${d.recommendedBaseUom})`);
      d.reasoning.forEach(r => console.log(`  ${r}`));
      console.log();
    });
  }

  // Export detailed report
  const csvLines = [
    'Confidence,SKU,Item Name,Category,Current Measure Type,Current Base UOM,Recommended Measure Type,Recommended Base UOM,Pack Analysis,Industry Standard,Reasoning'
  ];

  [...definite, ...high, ...medium, ...requiresReview].forEach(d => {
    csvLines.push([
      `"${d.confidence}"`,
      `"${d.sku}"`,
      `"${d.name}"`,
      `"${d.category}"`,
      `"${d.currentMeasureType}"`,
      `"${d.currentBaseUom}"`,
      `"${d.recommendedMeasureType}"`,
      `"${d.recommendedBaseUom}"`,
      `"${d.packAnalysis}"`,
      `"${d.industryStandard}"`,
      `"${d.reasoning.join(' | ')}"`
    ].join(','));
  });

  fs.writeFileSync('THOROUGH_FPA_REVIEW.csv', csvLines.join('\n'));
  console.log('\n✅ Detailed report exported to: THOROUGH_FPA_REVIEW.csv\n');

  console.log('═══════════════════════════════════════════════════════');
  console.log('RECOMMENDATION');
  console.log('═══════════════════════════════════════════════════════\n');

  const safeToApply = definite.length + high.length;
  console.log(`Can safely apply ${safeToApply} changes (DEFINITE + HIGH confidence)`);
  console.log(`${medium.length} MEDIUM confidence - review recommended before applying`);
  console.log(`${requiresReview.length} REQUIRE manual review\n`);

  console.log('Next steps:');
  console.log('1. Review THOROUGH_FPA_REVIEW.csv (sorted by confidence)');
  console.log('2. Apply DEFINITE + HIGH confidence changes (~' + safeToApply + ' items)');
  console.log('3. Review MEDIUM confidence items with ops team');
  console.log('4. Manually resolve the ' + requiresReview.length + ' unclear items\n');
}

thoroughFPAReview().catch(console.error);
