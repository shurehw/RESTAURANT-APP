/**
 * Round 3: Fix Seafood Supply Company and duplicate Spec's records
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const isLive = process.argv.includes('--live');
  console.log(isLive ? '🔴 LIVE MODE\n' : '🔵 DRY RUN (use --live to apply)\n');

  const { data: org } = await sb.from('organizations').select('id').ilike('name', '%wood%').single();
  if (!org) { console.error('Org not found'); return; }

  // 1. Merge "Seafood Supply Company" into "Seafood Supply Company, L.P."
  console.log('━━━ Seafood Supply Company ━━━');
  const { data: seafood } = await sb.from('vendors').select('id, name')
    .eq('organization_id', org.id).ilike('name', '%seafood supply%');

  const sfTarget = seafood?.find(v => v.name === 'Seafood Supply Company, L.P.');
  const sfSource = seafood?.find(v => v.name === 'Seafood Supply Company');

  if (sfSource && sfTarget) {
    const { count } = await sb.from('item_pack_configurations')
      .select('id', { count: 'exact', head: true }).eq('vendor_id', sfSource.id);
    console.log(`  "${sfSource.name}" (${count} packs) → "${sfTarget.name}"`);
    if (isLive) {
      await sb.from('item_pack_configurations').update({ vendor_id: sfTarget.id }).eq('vendor_id', sfSource.id);
      await sb.from('vendors').delete().eq('id', sfSource.id);
      console.log('  → Merged and deleted');
    }
  } else if (sfSource && !sfTarget) {
    console.log(`  No target found, renaming "${sfSource.name}" → "Seafood Supply Company, L.P."`);
    if (isLive) {
      await sb.from('vendors').update({ name: 'Seafood Supply Company, L.P.' }).eq('id', sfSource.id);
      console.log('  → Renamed');
    }
  }

  // 2. Merge duplicate "Spec's Wine, Spirits & Finer Foods"
  console.log('\n━━━ Spec\'s Wine, Spirits & Finer Foods ━━━');
  const { data: specs } = await sb.from('vendors').select('id, name')
    .eq('organization_id', org.id).eq('name', "Spec's Wine, Spirits & Finer Foods");

  if (specs && specs.length > 1) {
    console.log(`  Found ${specs.length} duplicate records`);
    const keep = specs[0]; // Keep first one
    for (let i = 1; i < specs.length; i++) {
      const dupe = specs[i];
      const { count } = await sb.from('item_pack_configurations')
        .select('id', { count: 'exact', head: true }).eq('vendor_id', dupe.id);
      console.log(`  Merging ${dupe.id} (${count} packs) → ${keep.id}`);
      if (isLive) {
        await sb.from('item_pack_configurations').update({ vendor_id: keep.id }).eq('vendor_id', dupe.id);
        await sb.from('vendors').delete().eq('id', dupe.id);
        console.log('  → Merged and deleted');
      }
    }
  }

  if (!isLive) console.log('\nRun with --live to apply');
}

main().catch(console.error);
