/**
 * Apply safe COGS data fixes for The h.wood Group.
 *
 * Safe fixes:
 * - Fix known category↔GL anomalies for wine items (set GL to 5320 Wine Cost)
 * - Normalize subcategory typos
 * - Normalize pack unit_size_uom casing (ml->mL, l->L)
 *
 * Usage:
 *   npx tsx scripts/cogs-fix-safe-hwood.ts --dry-run
 *   npx tsx scripts/cogs-fix-safe-hwood.ts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function getGlId(orgId: string, externalCode: string): Promise<string> {
  const { data, error } = await supabase
    .from('gl_accounts')
    .select('id')
    .eq('org_id', orgId)
    .eq('external_code', externalCode)
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error) throw error;
  return (data as any).id as string;
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const orgId = '13dacb8a-d2b5-42b8-bcc3-50bc372c0a41';

  console.log(`🧹 Safe COGS fixes (${dryRun ? 'DRY RUN' : 'APPLY'}) for org ${orgId}\n`);

  const wineGlId = await getGlId(orgId, '5320'); // Wine Cost

  // 1) Fix the two known anomalies (from latest audit output)
  const anomalyItemIds = [
    'e3e64fcf-8b94-486e-b0a7-69b2e114c272', // Emilio Moro Ribera del Duero 750ml
    'c6e801df-5c64-4de4-b375-eed18e57f55d', // Moet Imperial Brut Champagne 750ml
  ];

  if (dryRun) {
    console.log(`Would set gl_account_id=5320 for ${anomalyItemIds.length} items`);
  } else {
    const { error } = await supabase
      .from('items')
      .update({ gl_account_id: wineGlId })
      .in('id', anomalyItemIds);
    if (error) throw error;
    console.log(`✓ Set Wine Cost GL (5320) for ${anomalyItemIds.length} items`);
  }

  // 2) Normalize subcategory typos
  const typoMap: Record<string, string> = {
    liqeuer: 'liqueur',
    liquer: 'liqueur',
    liqueuer: 'liqueur',
  };

  const { data: typoItems, error: typoErr } = await supabase
    .from('items')
    .select('id, subcategory')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .in('subcategory', Object.keys(typoMap));
  if (typoErr) throw typoErr;

  if (!typoItems || typoItems.length === 0) {
    console.log('✓ No subcategory typos found');
  } else if (dryRun) {
    console.log(`Would fix ${typoItems.length} subcategory typos`);
  } else {
    for (const it of typoItems as any[]) {
      const fixed = typoMap[String(it.subcategory)];
      const { error } = await supabase.from('items').update({ subcategory: fixed }).eq('id', it.id);
      if (error) throw error;
    }
    console.log(`✓ Fixed ${typoItems.length} subcategory typos`);
  }

  // 3) Normalize pack unit_size_uom - casing and aliases
  const casingFixes: Array<{ from: string; to: string }> = [
    // casing
    { from: 'ml', to: 'mL' },
    { from: 'ML', to: 'mL' },
    { from: 'l', to: 'L' },
    { from: 'OZ', to: 'oz' },
    { from: 'GAL', to: 'gal' },
    // aliases
    { from: 'fl.oz', to: 'oz' },
    { from: 'quart', to: 'qt' },
    { from: 'unit', to: 'each' },
    { from: 'case', to: 'each' },  // misplaced pack_type, use 'each' as fallback
    { from: 'pack', to: 'each' },  // misplaced pack_type, use 'each' as fallback
  ];

  for (const f of casingFixes) {
    const { data: packs, error } = await supabase
      .from('item_pack_configurations')
      .select('id')
      .eq('is_active', true)
      .eq('unit_size_uom', f.from)
      .limit(5000);
    if (error) throw error;

    const ids = (packs || []).map((p: any) => p.id);
    if (ids.length === 0) continue;

    if (dryRun) {
      console.log(`Would update ${ids.length} pack configs unit_size_uom ${f.from} -> ${f.to}`);
    } else {
      // update in chunks
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const { error: upErr } = await supabase.from('item_pack_configurations').update({ unit_size_uom: f.to }).in('id', chunk);
        if (upErr) throw upErr;
      }
      console.log(`✓ Updated ${ids.length} pack configs unit_size_uom ${f.from} -> ${f.to}`);
    }
  }

  console.log('\n✅ Done');
}

main().catch((e) => {
  console.error('❌ Failed:', e);
  process.exit(1);
});

