/**
 * Populate vendor_id on item_pack_configurations (v2)
 * Uses item_id from invoice_lines to find the vendor for each item's pack configs
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function populateVendorIds() {
  console.log('🔗 Populating vendor_id via item_id → invoice_lines → invoices → vendor\n');

  // Step 1: Get all pack configs still missing vendor_id
  let packsToFix: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('item_pack_configurations')
      .select('id, vendor_item_code, item_id')
      .not('vendor_item_code', 'is', null)
      .is('vendor_id', null)
      .range(from, from + batchSize - 1);

    if (error || !data || data.length === 0) break;
    packsToFix = packsToFix.concat(data);
    from += batchSize;
    if (data.length < batchSize) break;
  }

  console.log(`Pack configs still needing vendor_id: ${packsToFix.length}\n`);

  // Step 2: Build item_id → vendor_id lookup from invoice_lines
  // An item appears on invoices from specific vendors
  console.log('Building item → vendor lookup from invoice_lines...');
  const itemVendorMap = new Map<string, { vendor_id: string; vendor_name: string; count: number }>();

  let ilFrom = 0;
  let totalLines = 0;
  while (true) {
    const { data: invoiceLines, error } = await supabase
      .from('invoice_lines')
      .select('item_id, invoice:invoices(vendor_id, vendor:vendors(id, name))')
      .not('item_id', 'is', null)
      .range(ilFrom, ilFrom + batchSize - 1);

    if (error || !invoiceLines || invoiceLines.length === 0) break;

    invoiceLines.forEach((il: any) => {
      const itemId = il.item_id;
      const invoice = il.invoice as any;
      const vendor = invoice?.vendor as any;
      if (itemId && vendor?.id && vendor?.name) {
        const existing = itemVendorMap.get(itemId);
        if (!existing || existing.count < 1) {
          // Track the most frequent vendor per item
          itemVendorMap.set(itemId, { vendor_id: vendor.id, vendor_name: vendor.name, count: (existing?.count || 0) + 1 });
        }
      }
    });

    totalLines += invoiceLines.length;
    ilFrom += batchSize;
    if (invoiceLines.length < batchSize) break;
    if (ilFrom % 5000 === 0) console.log(`  Processed ${ilFrom} invoice lines...`);
  }

  console.log(`  Processed ${totalLines} invoice lines`);
  console.log(`  Found vendors for ${itemVendorMap.size} unique items\n`);

  // Step 3: Also try sibling pack configs (same item_id, has vendor_id)
  console.log('Building sibling pack vendor lookup...');
  const itemIds = [...new Set(packsToFix.map(p => p.item_id))];
  let siblingMatches = 0;

  // Batch lookup
  for (let i = 0; i < itemIds.length; i += 100) {
    const batch = itemIds.slice(i, i + 100);
    const { data: siblingPacks } = await supabase
      .from('item_pack_configurations')
      .select('item_id, vendor_id, vendor:vendors(id, name)')
      .in('item_id', batch)
      .not('vendor_id', 'is', null);

    siblingPacks?.forEach((sp: any) => {
      const vendor = sp.vendor as any;
      if (sp.item_id && vendor?.id && !itemVendorMap.has(sp.item_id)) {
        itemVendorMap.set(sp.item_id, { vendor_id: vendor.id, vendor_name: vendor.name, count: 1 });
        siblingMatches++;
      }
    });
  }

  console.log(`  Found ${siblingMatches} additional items from sibling packs`);
  console.log(`  Total items with vendor: ${itemVendorMap.size}\n`);

  // Step 4: Match and update
  console.log('Updating pack configs...');
  let matched = 0;
  let unmatched = 0;
  let updated = 0;
  let failed = 0;
  const byVendor = new Map<string, number>();

  for (const pack of packsToFix) {
    const vendorInfo = itemVendorMap.get(pack.item_id);

    if (vendorInfo) {
      matched++;
      byVendor.set(vendorInfo.vendor_name, (byVendor.get(vendorInfo.vendor_name) || 0) + 1);

      const { error } = await supabase
        .from('item_pack_configurations')
        .update({ vendor_id: vendorInfo.vendor_id })
        .eq('id', pack.id);

      if (error) {
        failed++;
      } else {
        updated++;
        if (updated % 200 === 0) {
          console.log(`  ✅ Updated ${updated}/${matched} matched packs...`);
        }
      }
    } else {
      unmatched++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log('RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Total packs processed: ${packsToFix.length}`);
  console.log(`Matched to vendor: ${matched} (${((matched / packsToFix.length) * 100).toFixed(1)}%)`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed: ${failed}`);
  console.log(`Unmatched: ${unmatched}\n`);

  console.log('By Vendor (Top 20):');
  Array.from(byVendor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, count]) => {
      console.log(`  ${name}: ${count}`);
    });
  console.log();

  // Check final state
  const { count: stillMissing } = await supabase
    .from('item_pack_configurations')
    .select('id', { count: 'exact', head: true })
    .not('vendor_item_code', 'is', null)
    .is('vendor_id', null);

  const { count: totalWithVendor } = await supabase
    .from('item_pack_configurations')
    .select('id', { count: 'exact', head: true })
    .not('vendor_id', 'is', null);

  console.log(`Final state:`);
  console.log(`  Pack configs with vendor_id: ${totalWithVendor}`);
  console.log(`  Still missing vendor_id (has code): ${stillMissing}\n`);
}

populateVendorIds().catch(console.error);
