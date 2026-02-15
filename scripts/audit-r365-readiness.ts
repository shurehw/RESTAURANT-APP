/**
 * Audit R365 Readiness
 * Checks if items have all required R365 data for export
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditR365Readiness() {
  console.log('🔍 Auditing R365 Readiness for h.wood Group\n');

  // Get org ID for h.wood
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  if (!org) {
    console.error('❌ h.wood organization not found');
    return;
  }

  console.log(`Organization: ${org.name} (${org.id})\n`);

  // Get all active items with related data
  const { data: items, error } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      category,
      subcategory,
      base_uom,
      r365_measure_type,
      r365_reporting_uom,
      r365_inventory_uom,
      r365_cost_account,
      r365_inventory_account,
      r365_cost_update_method,
      r365_key_item,
      item_pack_configurations(
        id,
        pack_type,
        units_per_pack,
        unit_size,
        unit_size_uom,
        vendor_item_code,
        display_name
      ),
      gl_accounts(
        external_code,
        name
      )
    `)
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('❌ Error fetching items:', error);
    return;
  }

  if (!items || items.length === 0) {
    console.log('⚠️  No active items found');
    return;
  }

  console.log(`📊 Total Active Items: ${items.length}\n`);

  // Analyze coverage
  let missingGL = 0;
  let missingPack = 0;
  let missingSubcategory = 0;
  let missingR365Fields = 0;
  let fullyReady = 0;

  const issues: Array<{
    sku: string;
    name: string;
    problems: string[];
  }> = [];

  for (const item of items) {
    const problems: string[] = [];

    // Check GL Account
    if (!item.gl_accounts) {
      missingGL++;
      problems.push('No GL Account');
    }

    // Check Pack Configurations
    const packs = (item as any).item_pack_configurations || [];
    if (packs.length === 0) {
      missingPack++;
      problems.push('No Pack Configurations');
    }

    // Check Subcategory
    if (!item.subcategory) {
      missingSubcategory++;
      problems.push('No Subcategory');
    }

    // Check R365 Fields (optional but recommended)
    if (!item.r365_measure_type || !item.r365_cost_update_method) {
      missingR365Fields++;
      problems.push('Missing R365 fields (will use defaults)');
    }

    if (problems.length === 0) {
      fullyReady++;
    } else {
      issues.push({
        sku: item.sku,
        name: item.name,
        problems
      });
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📈 R365 READINESS SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`✅ Fully Ready:           ${fullyReady} / ${items.length} (${Math.round((fullyReady / items.length) * 100)}%)`);
  console.log(`❌ Missing GL Account:    ${missingGL}`);
  console.log(`❌ Missing Pack Config:   ${missingPack}`);
  console.log(`⚠️  Missing Subcategory:  ${missingSubcategory}`);
  console.log(`⚠️  Missing R365 Fields:  ${missingR365Fields} (will default)\n`);

  // Show items with issues
  if (issues.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log(`🔧 ITEMS NEEDING ATTENTION (${issues.length})`);
    console.log('═══════════════════════════════════════════════════════\n');

    issues.slice(0, 20).forEach((issue) => {
      console.log(`📦 ${issue.sku} - ${issue.name}`);
      issue.problems.forEach((p) => console.log(`   ⚠️  ${p}`));
      console.log('');
    });

    if (issues.length > 20) {
      console.log(`... and ${issues.length - 20} more items\n`);
    }
  }

  // Export readiness
  const criticalReady = items.length - missingGL - missingPack;
  const readyPercent = Math.round((criticalReady / items.length) * 100);

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 EXPORT READINESS');
  console.log('═══════════════════════════════════════════════════════\n');

  if (readyPercent === 100) {
    console.log('✅ 100% READY FOR R365 EXPORT!');
    console.log('   All items have GL accounts and pack configurations.');
    console.log(`\n   Run: GET /api/items/export?org_id=${org.id}`);
  } else {
    console.log(`⚠️  ${readyPercent}% READY FOR R365 EXPORT`);
    console.log(`   ${missingGL + missingPack} items need GL accounts or pack configs before export.\n`);

    console.log('Next Steps:');
    if (missingGL > 0) {
      console.log(`  1. Assign GL accounts to ${missingGL} items`);
    }
    if (missingPack > 0) {
      console.log(`  2. Add pack configurations to ${missingPack} items`);
    }
    if (missingSubcategory > 0) {
      console.log(`  3. (Optional) Add subcategories to ${missingSubcategory} items`);
    }
  }

  console.log('\n');
}

auditR365Readiness().catch(console.error);
