/**
 * Apply Vendor Codes from All Sources
 * Extract vendor codes from Dallas invoices, sibling packs, and invoice description matching
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

async function applyAllVendorCodes(dryRun: boolean = true) {
  console.log('🔧 Applying Vendor Codes from All Sources\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get all pack configs WITHOUT vendor codes
  console.log('Fetching pack configs without vendor codes...');

  const { data: packsWithoutCodes } = await supabase
    .from('item_pack_configurations')
    .select(`
      id,
      item_id,
      vendor_id,
      item:items!inner(
        id,
        sku,
        name,
        organization_id
      )
    `)
    .eq('item.organization_id', org!.id)
    .is('vendor_item_code', null);

  console.log(`Pack configs without vendor codes: ${packsWithoutCodes?.length || 0}\n`);

  const updates: Array<{
    packId: string;
    vendorCode: string;
    itemName: string;
    itemSku: string;
    source: string;
  }> = [];

  // SOURCE 1: Dallas OCR Invoices - Direct item_id match
  console.log('SOURCE 1: Extracting from Dallas OCR invoices...');

  const { data: dallasLines } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      item_id,
      vendor_item_code,
      invoice:invoices!inner(
        id,
        venue_id
      )
    `)
    .not('item_id', 'is', null)
    .not('vendor_item_code', 'is', null);

  // Build map: item_id → vendor_item_code
  const dallasVendorMap = new Map<string, string>();
  dallasLines?.forEach((line: any) => {
    if (line.item_id && line.vendor_item_code) {
      dallasVendorMap.set(line.item_id, line.vendor_item_code);
    }
  });

  packsWithoutCodes?.forEach((pack: any) => {
    const item = pack.item;
    const vendorCode = dallasVendorMap.get(item.id);
    if (vendorCode) {
      updates.push({
        packId: pack.id,
        vendorCode,
        itemName: item.name,
        itemSku: item.sku,
        source: 'Dallas OCR Invoice'
      });
    }
  });

  console.log(`  Found ${updates.length} from Dallas invoices\n`);

  // SOURCE 2: Same item, different pack configs
  console.log('SOURCE 2: Extracting from sibling pack configs...');

  const { data: allPackConfigs } = await supabase
    .from('item_pack_configurations')
    .select(`
      id,
      item_id,
      vendor_id,
      vendor_item_code,
      item:items!inner(
        organization_id
      )
    `)
    .eq('item.organization_id', org!.id);

  // Group by item_id
  const packsByItem = new Map<string, any[]>();
  allPackConfigs?.forEach((pack: any) => {
    if (!packsByItem.has(pack.item_id)) {
      packsByItem.set(pack.item_id, []);
    }
    packsByItem.get(pack.item_id)!.push(pack);
  });

  const beforeSiblingCount = updates.length;

  packsWithoutCodes?.forEach((pack: any) => {
    // Skip if already has update from Dallas
    if (updates.find(u => u.packId === pack.id)) return;

    const item = pack.item;
    const siblingPacks = packsByItem.get(item.id) || [];
    const packWithCode = siblingPacks.find(p => p.vendor_item_code);

    if (packWithCode) {
      updates.push({
        packId: pack.id,
        vendorCode: packWithCode.vendor_item_code,
        itemName: item.name,
        itemSku: item.sku,
        source: 'Sibling Pack Config'
      });
    }
  });

  console.log(`  Found ${updates.length - beforeSiblingCount} from sibling packs\n`);

  // SOURCE 3: Invoice description matching
  console.log('SOURCE 3: Extracting from invoice description matching...');

  const { data: allInvoiceLines } = await supabase
    .from('invoice_lines')
    .select('id, description, vendor_item_code')
    .not('vendor_item_code', 'is', null)
    .not('description', 'is', null);

  // Build map: normalized description → vendor_item_code
  const descriptionVendorMap = new Map<string, string>();
  allInvoiceLines?.forEach((line: any) => {
    if (line.description && line.vendor_item_code) {
      const normalized = normalizeItemName(line.description);
      if (!descriptionVendorMap.has(normalized)) {
        descriptionVendorMap.set(normalized, line.vendor_item_code);
      }
    }
  });

  const beforeDescriptionCount = updates.length;

  packsWithoutCodes?.forEach((pack: any) => {
    // Skip if already has update from previous sources
    if (updates.find(u => u.packId === pack.id)) return;

    const item = pack.item;
    const normalized = normalizeItemName(item.name);
    const vendorCode = descriptionVendorMap.get(normalized);

    if (vendorCode) {
      updates.push({
        packId: pack.id,
        vendorCode,
        itemName: item.name,
        itemSku: item.sku,
        source: 'Invoice Description Match'
      });
    }
  });

  console.log(`  Found ${updates.length - beforeDescriptionCount} from description matching\n`);

  // SUMMARY
  console.log('═══════════════════════════════════════════════════════');
  console.log('UPDATE SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const bySource = new Map<string, number>();
  updates.forEach(u => {
    bySource.set(u.source, (bySource.get(u.source) || 0) + 1);
  });

  console.log(`Total pack configs to update: ${updates.length}`);
  console.log(`Unique items: ${new Set(updates.map(u => u.itemSku)).size}\n`);

  console.log('By source:');
  bySource.forEach((count, source) => {
    console.log(`  ${source}: ${count}`);
  });
  console.log();

  if (updates.length > 0) {
    console.log('Sample Updates (first 20):');
    updates.slice(0, 20).forEach(u => {
      console.log(`  ${u.itemSku} - ${u.itemName}`);
      console.log(`    Vendor Code: ${u.vendorCode} (from ${u.source})`);
    });
    console.log();
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
          vendor_item_code: update.vendorCode,
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

    console.log('This will update:');
    console.log(`  - ${updates.length} pack configurations`);
    console.log(`  - ${new Set(updates.map(u => u.itemSku)).size} unique items`);
    console.log(`  - Add vendor_item_code from multiple sources\n`);

    console.log('To apply changes, run:');
    console.log('  npx tsx scripts/apply-all-vendor-codes.ts --live\n');
  } else {
    console.log('No vendor codes to apply.\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
applyAllVendorCodes(!isLive).catch(console.error);
