/**
 * Populate vendor_id on item_pack_configurations
 * Matches vendor_item_code from pack configs to invoice_lines to find the vendor
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function populateVendorIds() {
  console.log('🔗 Populating vendor_id on pack configurations\n');

  // Step 1: Get all pack configs with vendor_item_code but no vendor_id
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

  console.log(`Pack configs needing vendor_id: ${packsToFix.length}\n`);

  // Step 2: Build a vendor_item_code → vendor_id lookup from invoice_lines
  console.log('Building vendor lookup from invoice_lines...');
  const vendorCodeMap = new Map<string, { vendor_id: string; vendor_name: string }>();

  let ilFrom = 0;
  while (true) {
    const { data: invoiceLines, error } = await supabase
      .from('invoice_lines')
      .select('vendor_item_code, invoice:invoices(vendor_id, vendor:vendors(id, name))')
      .not('vendor_item_code', 'is', null)
      .range(ilFrom, ilFrom + batchSize - 1);

    if (error || !invoiceLines || invoiceLines.length === 0) break;

    invoiceLines.forEach((il: any) => {
      const code = il.vendor_item_code?.trim();
      const invoice = il.invoice as any;
      const vendor = invoice?.vendor as any;
      if (code && vendor?.id && vendor?.name) {
        // Use first occurrence (most common vendor for this code)
        if (!vendorCodeMap.has(code)) {
          vendorCodeMap.set(code, { vendor_id: vendor.id, vendor_name: vendor.name });
        }
      }
    });

    ilFrom += batchSize;
    if (invoiceLines.length < batchSize) break;
    if (ilFrom % 5000 === 0) console.log(`  Processed ${ilFrom} invoice lines...`);
  }

  console.log(`  Built lookup with ${vendorCodeMap.size} unique vendor codes\n`);

  // Step 3: Also check tipsee_purchase_items for vendor mapping
  console.log('Building vendor lookup from purchase items...');
  let piFrom = 0;
  let purchaseMatches = 0;

  while (true) {
    const { data: purchaseItems, error } = await supabase
      .from('tipsee_purchase_items')
      .select('vendor_item_code, vendor_name')
      .not('vendor_item_code', 'is', null)
      .not('vendor_name', 'is', null)
      .range(piFrom, piFrom + batchSize - 1);

    if (error || !purchaseItems || purchaseItems.length === 0) break;

    // Get vendor ids by name
    const vendorNames = [...new Set(purchaseItems.map((pi: any) => pi.vendor_name))];
    const { data: vendors } = await supabase
      .from('vendors')
      .select('id, name')
      .in('name', vendorNames);

    const vendorNameMap = new Map<string, string>();
    vendors?.forEach((v: any) => vendorNameMap.set(v.name, v.id));

    purchaseItems.forEach((pi: any) => {
      const code = pi.vendor_item_code?.trim();
      const vendorId = vendorNameMap.get(pi.vendor_name);
      if (code && vendorId && !vendorCodeMap.has(code)) {
        vendorCodeMap.set(code, { vendor_id: vendorId, vendor_name: pi.vendor_name });
        purchaseMatches++;
      }
    });

    piFrom += batchSize;
    if (purchaseItems.length < batchSize) break;
  }

  console.log(`  Added ${purchaseMatches} codes from purchase items`);
  console.log(`  Total lookup: ${vendorCodeMap.size} unique vendor codes\n`);

  // Step 4: Match and update
  console.log('Matching pack configs to vendors...');
  let matched = 0;
  let unmatched = 0;
  let updated = 0;
  let failed = 0;

  const byVendor = new Map<string, number>();

  for (const pack of packsToFix) {
    const code = pack.vendor_item_code?.trim();
    const vendorInfo = vendorCodeMap.get(code);

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

  console.log('By Vendor:');
  Array.from(byVendor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([name, count]) => {
      console.log(`  ${name}: ${count}`);
    });
  console.log();
}

populateVendorIds().catch(console.error);
