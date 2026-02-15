/**
 * Copy SKU to Vendor Code for Imported Items
 * For items where SKU = vendor SKU (from import), copy to vendor_item_code
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function copySKUToVendorCode(dryRun: boolean = true) {
  console.log('🔧 Copying SKU to Vendor Code for Imported Items\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get items created during import (Feb 2nd) with pack configs missing vendor codes
  console.log('Fetching items from import...');

  const { data: items } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      created_at,
      item_pack_configurations(
        id,
        vendor_item_code
      )
    `)
    .eq('organization_id', org!.id)
    .gte('created_at', '2026-02-01')
    .lte('created_at', '2026-02-03');

  console.log(`Items created during import: ${items?.length || 0}`);

  // Find items with pack configs missing vendor codes
  const updates: Array<{
    packId: string;
    itemSku: string;
    itemName: string;
  }> = [];

  items?.forEach((item: any) => {
    const packs = item.item_pack_configurations || [];

    // For each pack without a vendor code
    packs.forEach((pack: any) => {
      if (!pack.vendor_item_code && item.sku) {
        updates.push({
          packId: pack.id,
          itemSku: item.sku,
          itemName: item.name
        });
      }
    });
  });

  console.log(`Pack configs to update: ${updates.length}\n`);

  console.log('═══════════════════════════════════════════════════════');
  console.log('UPDATE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Total updates: ${updates.length}`);
  console.log(`Unique items: ${new Set(updates.map(u => u.itemSku)).size}\n`);

  if (updates.length > 0) {
    console.log('Sample Updates (first 30):');
    updates.slice(0, 30).forEach(u => {
      console.log(`  ${u.itemName}`);
      console.log(`    SKU → Vendor Code: ${u.itemSku}`);
    });
    console.log();

    if (updates.length > 30) {
      console.log(`... and ${updates.length - 30} more\n`);
    }
  }

  if (!dryRun && updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  APPLYING UPDATES');
    console.log('═══════════════════════════════════════════════════════\n');

    let updated = 0;
    let failed = 0;

    for (const update of updates) {
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({
          vendor_item_code: update.itemSku,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.packId);

      if (error) {
        console.error(`❌ Failed: ${update.itemSku} - ${error.message}`);
        failed++;
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`  ✅ Updated ${updated} pack configs...`);
        }
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}\n`);

  } else if (updates.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('This will:');
    console.log(`  - Copy item SKU to vendor_item_code for ${updates.length} pack configs`);
    console.log(`  - Affect ${new Set(updates.map(u => u.itemSku)).size} unique items`);
    console.log(`  - Use the vendor SKU that was set during import\n`);

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/copy-sku-to-vendor-code.ts --live\n');
  } else {
    console.log('No updates needed.\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
copySKUToVendorCode(!isLive).catch(console.error);
