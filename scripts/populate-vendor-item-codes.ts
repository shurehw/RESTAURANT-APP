/**
 * Populate vendor_id from purchase log VENDOR column
 * The original scripts had this data but never used it
 */

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔗 Populating vendor_id from purchase log VENDOR column\n');

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  if (!org) { console.error('Org not found'); return; }

  // Step 1: Build SKU → vendor name lookup from purchase logs
  console.log('Reading purchase logs...');
  const skuVendorMap = new Map<string, string>();

  // Beverage log: col 2 = SKU, col 8 = VENDOR
  const bevWb = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevRows = XLSX.utils.sheet_to_json(bevWb.Sheets[bevWb.SheetNames[0]], { header: 1 }) as any[][];
  for (let i = 6; i < bevRows.length; i++) {
    const row = bevRows[i];
    const sku = row[2]?.toString().trim();
    const vendor = row[8]?.toString().trim();
    if (sku && vendor) skuVendorMap.set(sku, vendor);
  }

  // Food log: col 2 = SKU, col 7 = VENDOR
  const foodWb = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodRows = XLSX.utils.sheet_to_json(foodWb.Sheets[foodWb.SheetNames[0]], { header: 1 }) as any[][];
  for (let i = 6; i < foodRows.length; i++) {
    const row = foodRows[i];
    const sku = row[2]?.toString().trim();
    const vendor = row[7]?.toString().trim();
    if (sku && vendor) skuVendorMap.set(sku, vendor);
  }

  console.log(`  ${skuVendorMap.size} unique SKU → vendor mappings`);
  const uniqueVendors = [...new Set(skuVendorMap.values())];
  console.log(`  ${uniqueVendors.length} unique vendors\n`);

  // Step 2: Match purchase log vendor names to DB vendor records
  const { data: dbVendors } = await supabase
    .from('vendors')
    .select('id, name')
    .eq('organization_id', org.id);

  const vendorIdByExact = new Map<string, string>();
  dbVendors?.forEach(v => vendorIdByExact.set(v.name.toLowerCase().trim(), v.id));

  const plToDbVendor = new Map<string, string>();
  const unmatchedNames: string[] = [];

  for (const plName of uniqueVendors) {
    const plLower = plName.toLowerCase().trim();

    // Exact match
    if (vendorIdByExact.has(plLower)) {
      plToDbVendor.set(plName, vendorIdByExact.get(plLower)!);
      continue;
    }

    // Substring match
    let found = false;
    for (const [dbLower, dbId] of vendorIdByExact) {
      if (dbLower.includes(plLower) || plLower.includes(dbLower)) {
        plToDbVendor.set(plName, dbId);
        found = true;
        break;
      }
    }

    // Keyword match
    if (!found) {
      const words = plLower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      for (const w of words) {
        if (found) break;
        for (const [dbLower, dbId] of vendorIdByExact) {
          if (dbLower.includes(w)) {
            plToDbVendor.set(plName, dbId);
            found = true;
            break;
          }
        }
      }
    }

    if (!found) unmatchedNames.push(plName);
  }

  console.log(`Vendor matching: ${plToDbVendor.size} matched, ${unmatchedNames.length} unmatched`);
  if (unmatchedNames.length > 0) {
    console.log('Creating new vendor records...');
    for (const name of unmatchedNames) {
      const { data: nv } = await supabase
        .from('vendors')
        .insert({ name, organization_id: org.id })
        .select('id')
        .single();
      if (nv) {
        plToDbVendor.set(name, nv.id);
        console.log(`  Created: ${name}`);
      }
    }
  }
  console.log();

  // Step 3: Get pack configs missing vendor_id
  let packs: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('item_pack_configurations')
      .select('id, vendor_item_code, item:items(organization_id)')
      .not('vendor_item_code', 'is', null)
      .is('vendor_id', null)
      .range(from, from + 1000 - 1);
    if (!data || data.length === 0) break;
    packs = packs.concat(data.filter((p: any) => p.item?.organization_id === org.id));
    from += 1000;
    if (data.length < 1000) break;
  }

  console.log(`Packs missing vendor_id: ${packs.length}`);

  // Step 4: Match and update
  let updated = 0;
  let unmatched = 0;
  const byVendor = new Map<string, number>();

  for (const pack of packs) {
    const code = pack.vendor_item_code?.trim();
    const plVendor = skuVendorMap.get(code);

    if (plVendor && plToDbVendor.has(plVendor)) {
      const vendorId = plToDbVendor.get(plVendor)!;
      const { error } = await supabase
        .from('item_pack_configurations')
        .update({ vendor_id: vendorId })
        .eq('id', pack.id);

      if (!error) {
        updated++;
        byVendor.set(plVendor, (byVendor.get(plVendor) || 0) + 1);
        if (updated % 200 === 0) console.log(`  ✅ Updated ${updated}...`);
      }
    } else {
      unmatched++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log('RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Updated: ${updated}`);
  console.log(`Unmatched: ${unmatched}\n`);

  console.log('By Vendor:');
  Array.from(byVendor.entries()).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => console.log(`  ${n}: ${c}`));

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
