import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixAuditIssues() {
  console.log('\n=== Fixing Audit Issues ===\n');

  // ===== FIX 1: INVALID CONVERSION FACTORS =====
  console.log('━━━ 1. Fixing Invalid Conversion Factors ━━━\n');

  const { data: allPackConfigs } = await supabase
    .from('item_pack_configurations')
    .select('*');

  let fixedConversions = 0;

  for (const config of allPackConfigs || []) {
    const expected = config.units_per_pack * config.unit_size;
    const diff = Math.abs(config.conversion_factor - expected);

    if (diff > 0.01) {
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({ conversion_factor: expected })
        .eq('id', config.id);

      if (!error) {
        fixedConversions++;
        if (fixedConversions <= 10) {
          console.log(`✓ Fixed: ${config.units_per_pack} × ${config.unit_size}${config.unit_size_uom}`);
          console.log(`  Old: ${config.conversion_factor} → New: ${expected}`);
        }
      }
    }
  }

  console.log(`\n✅ Fixed ${fixedConversions} invalid conversion factors\n`);

  // ===== FIX 2: CATEGORY/GL MISMATCHES =====
  console.log('━━━ 2. Fixing Category/GL Mismatches ━━━\n');

  const { data: items } = await supabase
    .from('items')
    .select('id, name, category, gl_accounts(external_code, name)')
    .eq('is_active', true);

  let fixedCategories = 0;

  for (const item of items || []) {
    const glAccount = (item as any).gl_accounts;
    if (!glAccount?.external_code) continue;

    // Determine correct category from GL account
    const correctCategory = getCategoryFromGL(glAccount.external_code);

    if (correctCategory && correctCategory !== item.category) {
      const { error } = await supabase
        .from('items')
        .update({ category: correctCategory })
        .eq('id', item.id);

      if (!error) {
        fixedCategories++;
        console.log(`✓ ${item.name}`);
        console.log(`  Category: ${item.category} → ${correctCategory} (GL: ${glAccount.external_code})`);
      }
    }
  }

  console.log(`\n✅ Fixed ${fixedCategories} category/GL mismatches\n`);

  console.log('━━━ All Issues Fixed ━━━\n');
}

function getCategoryFromGL(glCode: string): string | null {
  if (glCode.startsWith('5310')) return 'liquor';
  if (glCode.startsWith('5320')) return 'wine';
  if (glCode.startsWith('5330')) return 'beer';
  if (glCode.startsWith('5335')) return 'non_alcoholic_beverage';
  if (glCode.startsWith('5315')) return 'bar_consumables';
  if (glCode.startsWith('5100')) return 'food';
  if (glCode.startsWith('5400')) return 'packaging';
  return null;
}

fixAuditIssues().catch(console.error);
