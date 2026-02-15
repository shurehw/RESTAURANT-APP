/**
 * Deep search for remaining vendor IDs
 * Try every possible matching strategy:
 * 1. Item SKU → purchase log SKU → vendor
 * 2. Item name → purchase log name → vendor
 * 3. Item ID → invoice_lines → invoices → vendor
 * 4. Vendor_item_code treated as alternate SKU
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

async function main() {
  console.log('🔍 Deep search for remaining vendor IDs\n');

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();
  if (!org) { console.error('Org not found'); return; }

  // Get all packs still missing vendor_id
  let packs: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('item_pack_configurations')
      .select('id, vendor_item_code, item_id, item:items(sku, name, category, organization_id)')
      .not('vendor_item_code', 'is', null)
      .is('vendor_id', null)
      .range(from, from + 1000 - 1);
    if (!data || data.length === 0) break;
    packs = packs.concat(data.filter((p: any) => p.item?.organization_id === org.id));
    from += 1000;
    if (data.length < 1000) break;
  }

  console.log(`Still missing vendor_id: ${packs.length}\n`);

  // Show breakdown by category
  const byCat = new Map<string, number>();
  packs.forEach(p => {
    const cat = (p.item as any)?.category || 'unknown';
    byCat.set(cat, (byCat.get(cat) || 0) + 1);
  });
  console.log('By category:');
  Array.from(byCat.entries()).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}`));
  console.log();

  // Load purchase logs: build ITEM NAME → vendor AND SKU → vendor
  console.log('Building lookups from purchase logs...');
  const nameVendorMap = new Map<string, string>();
  const skuVendorMap = new Map<string, string>();

  // Beverage log: col 2=SKU, col 3=itemName, col 8=VENDOR
  const bevWb = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevRows = XLSX.utils.sheet_to_json(bevWb.Sheets[bevWb.SheetNames[0]], { header: 1 }) as any[][];
  for (let i = 6; i < bevRows.length; i++) {
    const row = bevRows[i];
    const sku = row[2]?.toString().trim();
    const itemName = row[3]?.toString().trim();
    const vendor = row[8]?.toString().trim();
    if (vendor) {
      if (sku) skuVendorMap.set(sku, vendor);
      if (itemName) nameVendorMap.set(normalize(itemName), vendor);
    }
  }

  // Food log: col 2=SKU, col 3=itemName, col 7=VENDOR
  const foodWb = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodRows = XLSX.utils.sheet_to_json(foodWb.Sheets[foodWb.SheetNames[0]], { header: 1 }) as any[][];
  for (let i = 6; i < foodRows.length; i++) {
    const row = foodRows[i];
    const sku = row[2]?.toString().trim();
    const itemName = row[3]?.toString().trim();
    const vendor = row[7]?.toString().trim();
    if (vendor) {
      if (sku) skuVendorMap.set(sku, vendor);
      if (itemName) nameVendorMap.set(normalize(itemName), vendor);
    }
  }

  console.log(`  SKU → vendor: ${skuVendorMap.size}`);
  console.log(`  Name → vendor: ${nameVendorMap.size}\n`);

  // Build invoice_lines item_id → vendor lookup
  console.log('Building invoice item_id → vendor lookup...');
  const itemIdVendorMap = new Map<string, string>();
  let ilFrom = 0;
  while (true) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('item_id, invoice:invoices(vendor:vendors(id, name))')
      .not('item_id', 'is', null)
      .range(ilFrom, ilFrom + 1000 - 1);
    if (!lines || lines.length === 0) break;
    lines.forEach((l: any) => {
      const vendor = (l.invoice as any)?.vendor as any;
      if (l.item_id && vendor?.name) itemIdVendorMap.set(l.item_id, vendor.name);
    });
    ilFrom += 1000;
    if (lines.length < 1000) break;
  }
  console.log(`  item_id → vendor: ${itemIdVendorMap.size}\n`);

  // Get vendor name → id mapping
  const { data: dbVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', org.id);

  const vendorNameToId = new Map<string, string>();
  dbVendors?.forEach(v => vendorNameToId.set(v.name.toLowerCase(), v.id));

  function findVendorId(vendorName: string): string | null {
    const lower = vendorName.toLowerCase().trim();
    if (vendorNameToId.has(lower)) return vendorNameToId.get(lower)!;
    for (const [dbName, dbId] of vendorNameToId) {
      if (dbName.includes(lower) || lower.includes(dbName)) return dbId;
    }
    const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    for (const w of words) {
      for (const [dbName, dbId] of vendorNameToId) {
        if (dbName.includes(w)) return dbId;
      }
    }
    return null;
  }

  // Try matching strategies in order
  console.log('Matching with multiple strategies...\n');
  let updated = 0;
  let stratCounts = { byItemSku: 0, byItemName: 0, byItemId: 0, byVendorCodeAsSku: 0, unmatched: 0 };
  const byVendor = new Map<string, number>();
  const stillMissingItems: any[] = [];

  for (const pack of packs) {
    const item = pack.item as any;
    const code = pack.vendor_item_code?.trim();
    let vendorName: string | null = null;
    let strategy = '';

    // Strategy 1: Match item SKU against purchase log SKU
    if (!vendorName && item?.sku) {
      vendorName = skuVendorMap.get(item.sku) || null;
      if (vendorName) strategy = 'byItemSku';
    }

    // Strategy 2: Match item name against purchase log names
    if (!vendorName && item?.name) {
      vendorName = nameVendorMap.get(normalize(item.name)) || null;
      if (vendorName) strategy = 'byItemName';
    }

    // Strategy 3: Match item_id against invoice_lines
    if (!vendorName && pack.item_id) {
      vendorName = itemIdVendorMap.get(pack.item_id) || null;
      if (vendorName) strategy = 'byItemId';
    }

    // Strategy 4: vendor_item_code might match a purchase log SKU
    if (!vendorName && code && code !== item?.sku) {
      vendorName = skuVendorMap.get(code) || null;
      if (vendorName) strategy = 'byVendorCodeAsSku';
    }

    if (vendorName) {
      const vendorId = findVendorId(vendorName);
      if (vendorId) {
        const { error } = await supabase
          .from('item_pack_configurations')
          .update({ vendor_id: vendorId })
          .eq('id', pack.id);
        if (!error) {
          updated++;
          (stratCounts as any)[strategy]++;
          byVendor.set(vendorName, (byVendor.get(vendorName) || 0) + 1);
          if (updated % 100 === 0) console.log(`  ✅ Updated ${updated}...`);
        }
      } else {
        stratCounts.unmatched++;
        stillMissingItems.push(pack);
      }
    } else {
      stratCounts.unmatched++;
      stillMissingItems.push(pack);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log('RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Updated: ${updated}`);
  console.log(`  By item SKU in purchase log: ${stratCounts.byItemSku}`);
  console.log(`  By item name in purchase log: ${stratCounts.byItemName}`);
  console.log(`  By item_id in invoice lines: ${stratCounts.byItemId}`);
  console.log(`  By vendor code as SKU: ${stratCounts.byVendorCodeAsSku}`);
  console.log(`  Still unmatched: ${stratCounts.unmatched}\n`);

  console.log('By Vendor:');
  Array.from(byVendor.entries()).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${n}: ${c}`));

  const { count: withVendor } = await supabase
    .from('item_pack_configurations')
    .select('id', { count: 'exact', head: true })
    .not('vendor_id', 'is', null);

  const { count: remaining } = await supabase
    .from('item_pack_configurations')
    .select('id', { count: 'exact', head: true })
    .not('vendor_item_code', 'is', null)
    .is('vendor_id', null);

  console.log(`\nFinal: ${withVendor} with vendor, ${remaining} still missing`);

  // Show sample of truly unmatched
  console.log('\nSample of truly unmatched:');
  stillMissingItems.slice(0, 20).forEach(p => {
    const item = p.item as any;
    console.log(`  ${item?.sku} | ${item?.name} | ${item?.category} | code: ${p.vendor_item_code}`);
  });
}

main().catch(console.error);
