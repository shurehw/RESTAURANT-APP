/**
 * Consolidate duplicate vendor names to match R365 exactly.
 * For each group: rename canonical vendor, reassign pack configs from duplicates, delete duplicates.
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Map: R365 canonical name → array of our DB names that should merge into it
const CONSOLIDATION_MAP: Record<string, string[]> = {
  // Chef's Warehouse variants → R365 name
  "The Chef's Warehouse Midwest LLC": [
    "Chef's Warehouse",
    "Chefs' Warehouse",
    "The Chefswarehouse Midwest LLC",
    "The Chefswarehouse",
    "Chef's Warehouse Midwest LLC",
  ],
  // RNDC variants
  "RNDC": [
    "Republic National Distributing Company",
    "RNDC (Republic National Distributing Company)",
  ],
  // Southern Glazer's
  "SOUTHERN GLAZERS WINE & SPIRITS LLC": [
    "Southern Glazer's of TX",
  ],
  // Rocker Bros
  "Rocker Bros Meat & Provision": [
    "Rocker Bros. Meat & Provision, INC.",
  ],
  // Spec's — consolidate Spec's Liquors into main
  "Spec's Wine, Spirits & Finer Foods": [
    "Spec's Liquors",
  ],
  // Chefs' Produce — consolidate variant
  "Chefs' Produce": [
    "Chefs' Produce Company",
  ],
  // Fix typo
  "DFA Dairy Brands": [
    "DFA Daiby Brands",
  ],
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

  // Get all vendors for this org
  const { data: allVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', org.id);
  if (!allVendors) { console.error('No vendors found'); return; }

  const vendorByName = new Map<string, { id: string; name: string }>();
  allVendors.forEach(v => vendorByName.set(v.name, v));

  let totalReassigned = 0;
  let totalRenamed = 0;
  let totalDeleted = 0;

  for (const [canonicalName, duplicateNames] of Object.entries(CONSOLIDATION_MAP)) {
    console.log(`\n━━━ ${canonicalName} ━━━`);

    // Find or identify canonical vendor
    let canonical = vendorByName.get(canonicalName);

    // Collect all duplicate vendor records
    const dupes: { id: string; name: string }[] = [];
    for (const dname of duplicateNames) {
      const v = vendorByName.get(dname);
      if (v) dupes.push(v);
    }

    if (dupes.length === 0) {
      console.log('  No duplicate records found, skipping');
      continue;
    }

    // If canonical doesn't exist, rename first duplicate to canonical name
    if (!canonical) {
      const first = dupes.shift()!;
      console.log(`  Renaming "${first.name}" → "${canonicalName}"`);
      if (isLive) {
        await supabase.from('vendors').update({ name: canonicalName }).eq('id', first.id);
      }
      canonical = { id: first.id, name: canonicalName };
      totalRenamed++;
    }

    // Reassign pack configs from each duplicate to canonical
    for (const dupe of dupes) {
      // Count how many pack configs reference this duplicate
      const { count } = await supabase
        .from('item_pack_configurations')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', dupe.id);

      console.log(`  "${dupe.name}" (${count} packs) → merging into canonical`);

      if (isLive && count && count > 0) {
        const { error } = await supabase
          .from('item_pack_configurations')
          .update({ vendor_id: canonical.id })
          .eq('vendor_id', dupe.id);
        if (error) {
          console.log(`    ❌ Error reassigning: ${error.message}`);
          continue;
        }
      }
      totalReassigned += (count || 0);

      // Delete the duplicate vendor record
      if (isLive) {
        // Check no remaining references
        const { count: remaining } = await supabase
          .from('item_pack_configurations')
          .select('id', { count: 'exact', head: true })
          .eq('vendor_id', dupe.id);
        if (remaining === 0) {
          await supabase.from('vendors').delete().eq('id', dupe.id);
          console.log(`    Deleted duplicate vendor record`);
          totalDeleted++;
        } else {
          console.log(`    ⚠️ Still has ${remaining} refs, not deleting`);
        }
      } else {
        totalDeleted++;
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Vendors renamed: ${totalRenamed}`);
  console.log(`  Pack configs reassigned: ${totalReassigned}`);
  console.log(`  Duplicate vendors deleted: ${totalDeleted}`);
  if (!isLive) console.log('\n  Run with --live to apply changes');
}

main().catch(console.error);
