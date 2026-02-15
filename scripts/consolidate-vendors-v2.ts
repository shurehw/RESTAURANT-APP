/**
 * Round 2: Fix remaining vendor name issues
 * 1. Merge any remaining "Republic National Distributing Company" into RNDC
 * 2. Rename vendors to match exact R365 names for import compatibility
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Exact renames: our name → R365 exact name
const RENAMES: Record<string, string> = {
  "Seafood Supply Company": "Seafood Supply Company, L.P.",
  "Sysco": "SYSCO LOS ANGELES INC - ACH",
  "Dairyland Produce, LLC (dba Hardie's Fresh Foods)": "Dairyland Produce, LLC",
};

// Merges: source name → target name (target must already exist)
const MERGES: Record<string, string> = {
  "Republic National Distributing Company": "RNDC",
};

async function main() {
  const isLive = process.argv.includes('--live');
  console.log(isLive ? '🔴 LIVE MODE\n' : '🔵 DRY RUN (use --live to apply)\n');

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();
  if (!org) { console.error('Org not found'); return; }

  // Get ALL vendors (there may be duplicates with same name)
  const { data: allVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', org.id);
  if (!allVendors) { console.error('No vendors'); return; }

  // Handle MERGES — find ALL vendor records matching source name
  for (const [sourceName, targetName] of Object.entries(MERGES)) {
    console.log(`\n━━━ Merge "${sourceName}" → "${targetName}" ━━━`);

    const target = allVendors.find(v => v.name === targetName);
    if (!target) {
      console.log(`  ⚠️ Target "${targetName}" not found, skipping`);
      continue;
    }

    // Find ALL records matching source name (there may be multiples)
    const sources = allVendors.filter(v => v.name === sourceName);
    console.log(`  Found ${sources.length} vendor record(s) named "${sourceName}"`);

    for (const src of sources) {
      const { count } = await supabase
        .from('item_pack_configurations')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', src.id);

      console.log(`  Vendor ${src.id}: ${count} pack configs`);

      if (isLive && count && count > 0) {
        await supabase
          .from('item_pack_configurations')
          .update({ vendor_id: target.id })
          .eq('vendor_id', src.id);
        console.log(`    → Reassigned ${count} packs to ${targetName}`);
      }

      if (isLive) {
        const { count: remaining } = await supabase
          .from('item_pack_configurations')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_id', src.id);
        if (remaining === 0) {
          await supabase.from('vendors').delete().eq('id', src.id);
          console.log(`    → Deleted vendor record`);
        }
      }
    }
  }

  // Handle RENAMES
  for (const [oldName, newName] of Object.entries(RENAMES)) {
    console.log(`\n━━━ Rename "${oldName}" → "${newName}" ━━━`);

    // Check if target name already exists
    const existing = allVendors.find(v => v.name === newName);
    const source = allVendors.find(v => v.name === oldName);

    if (!source) {
      console.log(`  ⚠️ Source "${oldName}" not found, skipping`);
      continue;
    }

    if (existing && existing.id !== source.id) {
      // Target already exists — merge instead
      const { count } = await supabase
        .from('item_pack_configurations')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', source.id);

      console.log(`  Target exists, merging ${count} packs`);
      if (isLive && count && count > 0) {
        await supabase
          .from('item_pack_configurations')
          .update({ vendor_id: existing.id })
          .eq('vendor_id', source.id);
      }
      if (isLive) {
        await supabase.from('vendors').delete().eq('id', source.id);
        console.log(`  → Merged and deleted duplicate`);
      }
    } else {
      // Simple rename
      const { count } = await supabase
        .from('item_pack_configurations')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', source.id);
      console.log(`  Renaming (${count} packs)`);
      if (isLive) {
        await supabase.from('vendors').update({ name: newName }).eq('id', source.id);
        console.log(`  → Renamed`);
      }
    }
  }

  if (!isLive) console.log('\n\nRun with --live to apply changes');
}

main().catch(console.error);
