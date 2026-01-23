import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function comprehensiveReview() {
  // Get org ID
  const { data: items } = await supabase
    .from('items')
    .select('organization_id')
    .limit(1);
  const orgId = items?.[0]?.organization_id;

  console.log('═══════════════════════════════════════════════════');
  console.log('        INVOICE MATCHING SYSTEM REVIEW');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Item Coverage
  console.log('1️⃣  ITEM COVERAGE');
  console.log('─────────────────────────────────────────────────\n');

  const { data: categoryCounts } = await supabase
    .from('items')
    .select('category')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  const counts: Record<string, number> = {};
  categoryCounts?.forEach((item: any) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

  console.log('Items by category:');
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cat, count]) => {
      console.log(`  ${cat.padEnd(25)} ${count}`);
    });
  console.log(`  ${'TOTAL'.padEnd(25)} ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
  console.log('');

  // 2. Pack Configurations
  console.log('2️⃣  PACK CONFIGURATIONS');
  console.log('─────────────────────────────────────────────────\n');

  const { data: packConfigStats } = await supabase
    .from('item_pack_configurations')
    .select('item_id')
    .limit(10000);

  const itemsWithPacks = new Set(packConfigStats?.map((p: any) => p.item_id) || []);
  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);
  const itemsWithPackConfigs = itemsWithPacks.size;
  const itemsWithoutPackConfigs = totalItems - itemsWithPackConfigs;

  console.log(`Items with pack configs:     ${itemsWithPackConfigs} (${Math.round(itemsWithPackConfigs/totalItems*100)}%)`);
  console.log(`Items without pack configs:  ${itemsWithoutPackConfigs} (${Math.round(itemsWithoutPackConfigs/totalItems*100)}%)`);
  console.log('');

  // Sample pack configs
  const { data: samplePacks } = await supabase
    .from('item_pack_configurations')
    .select('item_id, pack_type, units_per_pack, unit_size, unit_size_uom, items(name)')
    .limit(5);

  console.log('Sample pack configurations:');
  samplePacks?.forEach((pack: any) => {
    console.log(`  ${pack.items?.name}`);
    console.log(`    ${pack.pack_type}: ${pack.units_per_pack} x ${pack.unit_size} ${pack.unit_size_uom}`);
  });
  console.log('');

  // 3. GL Account Mapping
  console.log('3️⃣  GL ACCOUNT MAPPING');
  console.log('─────────────────────────────────────────────────\n');

  const { data: glMapped } = await supabase
    .from('items')
    .select('category, gl_account_id, r365_cost_account')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  const glStats: Record<string, { total: number; withGL: number; withR365: number }> = {};
  glMapped?.forEach((item: any) => {
    if (!glStats[item.category]) {
      glStats[item.category] = { total: 0, withGL: 0, withR365: 0 };
    }
    glStats[item.category].total++;
    if (item.gl_account_id) glStats[item.category].withGL++;
    if (item.r365_cost_account) glStats[item.category].withR365++;
  });

  console.log('GL Account coverage by category:');
  console.log(`${'Category'.padEnd(25)} ${'Total'.padEnd(8)} ${'GL ID'.padEnd(8)} ${'R365 Cost'.padEnd(12)}`);
  Object.entries(glStats)
    .sort(([, a], [, b]) => b.total - a.total)
    .forEach(([cat, stats]) => {
      const glPct = Math.round(stats.withGL / stats.total * 100);
      const r365Pct = Math.round(stats.withR365 / stats.total * 100);
      console.log(`${cat.padEnd(25)} ${String(stats.total).padEnd(8)} ${String(stats.withGL).padEnd(4)}(${String(glPct).padEnd(2)}%) ${String(stats.withR365).padEnd(4)}(${String(r365Pct).padEnd(2)}%)`);
    });
  console.log('');

  // 4. Vendor Aliases
  console.log('4️⃣  VENDOR ALIASES');
  console.log('─────────────────────────────────────────────────\n');

  const { count: aliasCount } = await supabase
    .from('vendor_item_aliases')
    .select('*', { count: 'exact', head: true });

  console.log(`Total vendor aliases: ${aliasCount || 0}`);

  if (aliasCount && aliasCount > 0) {
    const { data: sampleAliases } = await supabase
      .from('vendor_item_aliases')
      .select('vendor_description, vendors(name), items(name)')
      .limit(5);

    console.log('\nSample aliases:');
    sampleAliases?.forEach((alias: any) => {
      console.log(`  ${alias.vendors?.name}: "${alias.vendor_description}"`);
      console.log(`    → ${alias.items?.name}`);
    });
  } else {
    console.log('⚠️  No vendor aliases configured yet');
  }
  console.log('');

  // 5. R365 Compliance
  console.log('5️⃣  R365 COMPLIANCE');
  console.log('─────────────────────────────────────────────────\n');

  const { data: r365Stats } = await supabase
    .from('items')
    .select('category, r365_measure_type, r365_reporting_uom, r365_inventory_uom, r365_cost_account, r365_inventory_account')
    .eq('organization_id', orgId)
    .eq('is_active', true);

  let fullyCompliant = 0;
  let partialCompliant = 0;
  let nonCompliant = 0;

  r365Stats?.forEach((item: any) => {
    const fields = [
      item.r365_measure_type,
      item.r365_reporting_uom,
      item.r365_inventory_uom,
      item.r365_cost_account,
      item.r365_inventory_account
    ];
    const filled = fields.filter(f => f).length;

    if (filled === 5) fullyCompliant++;
    else if (filled > 0) partialCompliant++;
    else nonCompliant++;
  });

  const total = r365Stats?.length || 0;
  console.log(`Fully R365 compliant:    ${fullyCompliant} (${Math.round(fullyCompliant/total*100)}%)`);
  console.log(`Partially compliant:     ${partialCompliant} (${Math.round(partialCompliant/total*100)}%)`);
  console.log(`Non-compliant:           ${nonCompliant} (${Math.round(nonCompliant/total*100)}%)`);
  console.log('');

  // 6. Search Quality Test
  console.log('6️⃣  SEARCH QUALITY TEST');
  console.log('─────────────────────────────────────────────────\n');

  const testQueries = [
    'Don Julio Tequila*Anejo',
    'Hibiki Harmony Japanese Wh',
    'Ketel-One Vodka',
    'Grey Goose',
    'Patron Silver'
  ];

  for (const query of testQueries) {
    const normalized = query
      .replace(/[*\-_\/\\|]/g, ' ')
      .replace(/\b(tequila|vodka|whiskey|whisky|gin|rum|bourbon|scotch|cognac|brandy|liqueur|wine|beer|champagne|mezcal)\b/gi, ' ')
      .replace(/\b(japanese|french|scottish|american|mexican|irish|canadian)\b/gi, ' ')
      .replace(/\b(wh|whis|whisk)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const { data: results } = await supabase
      .from('items')
      .select('name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .or(`name.ilike.%${normalized}%,sku.ilike.%${normalized}%`)
      .limit(3);

    console.log(`Query: "${query}"`);
    console.log(`  Normalized: "${normalized}"`);
    console.log(`  Results: ${results?.length || 0}`);
    if (results && results.length > 0) {
      results.forEach((r: any) => console.log(`    ✓ ${r.name}`));
    } else {
      console.log(`    ✗ No matches`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('                    SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');

  const issues: string[] = [];
  const warnings: string[] = [];

  if (itemsWithoutPackConfigs > totalItems * 0.5) {
    warnings.push(`${Math.round(itemsWithoutPackConfigs/totalItems*100)}% of items missing pack configurations`);
  }

  if (nonCompliant > total * 0.1) {
    warnings.push(`${Math.round(nonCompliant/total*100)}% of items are not R365 compliant`);
  }

  if (!aliasCount || aliasCount === 0) {
    warnings.push('No vendor aliases configured - matching may be less accurate');
  }

  if (issues.length > 0) {
    console.log('🔴 CRITICAL ISSUES:');
    issues.forEach(issue => console.log(`  • ${issue}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    warnings.forEach(warning => console.log(`  • ${warning}`));
    console.log('');
  }

  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ System is in good shape!');
    console.log('');
  }

  console.log('RECOMMENDATIONS:');
  if (itemsWithoutPackConfigs > 0) {
    console.log('  1. Add pack configurations to improve invoice matching accuracy');
  }
  if (aliasCount === 0) {
    console.log('  2. Configure vendor aliases for frequently ordered items');
  }
  if (nonCompliant > 0) {
    console.log('  3. Complete R365 fields for remaining items before export');
  }
  console.log('');
}

comprehensiveReview();
