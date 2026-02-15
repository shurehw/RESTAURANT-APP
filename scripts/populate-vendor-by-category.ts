/**
 * Populate vendor_id by category defaults (only categories with >60% dominant vendor)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔗 Applying category vendor defaults\n');

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  if (!org) { console.error('Org not found'); return; }

  // Get vendor IDs for our known defaults
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', org.id);

  const vendorByName = new Map<string, string>();
  vendors?.forEach(v => vendorByName.set(v.name, v.id));

  const specsId = vendorByName.get("Spec's Wine, Spirits & Finer Foods");
  const chefsId = vendorByName.get("Chef's Warehouse");

  console.log(`Spec's ID: ${specsId}`);
  console.log(`Chef's Warehouse ID: ${chefsId}\n`);

  if (!specsId) { console.error("Spec's vendor not found"); return; }

  // Categories with clear dominant vendor (>60%)
  const categoryDefaults: Record<string, { vendor_id: string; vendor_name: string }> = {
    beer: { vendor_id: specsId, vendor_name: "Spec's" },
    liquor: { vendor_id: specsId, vendor_name: "Spec's" },
    spirits: { vendor_id: specsId, vendor_name: "Spec's" },
    liqueur: { vendor_id: specsId, vendor_name: "Spec's" },
    non_alcoholic_beverage: { vendor_id: specsId, vendor_name: "Spec's" },
    beverage: { vendor_id: chefsId!, vendor_name: "Chef's Warehouse" },
  };

  // Get unmatched packs with their item category
  let unmatchedPacks: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('item_pack_configurations')
      .select('id, item:items(category, organization_id)')
      .not('vendor_item_code', 'is', null)
      .is('vendor_id', null)
      .range(from, from + 1000 - 1);
    if (!data || data.length === 0) break;
    unmatchedPacks = unmatchedPacks.concat(data.filter((p: any) => p.item?.organization_id === org.id));
    from += 1000;
    if (data.length < 1000) break;
  }

  console.log(`Unmatched packs: ${unmatchedPacks.length}`);

  let updated = 0;
  let skipped = 0;

  for (const pack of unmatchedPacks) {
    const cat = pack.item?.category;
    const def = categoryDefaults[cat];

    if (def) {
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({ vendor_id: def.vendor_id })
        .eq('id', pack.id);

      if (!error) updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\nUpdated: ${updated}`);
  console.log(`Skipped (no clear default): ${skipped}`);

  const { count: withVendor } = await supabase
    .from('item_pack_configurations')
    .select('id', { count: 'exact', head: true })
    .not('vendor_id', 'is', null);

  const { count: stillMissing } = await supabase
    .from('item_pack_configurations')
    .select('id', { count: 'exact', head: true })
    .not('vendor_item_code', 'is', null)
    .is('vendor_id', null);

  console.log(`\nFinal: ${withVendor} with vendor, ${stillMissing} still missing`);
}

main().catch(console.error);
