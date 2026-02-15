/**
 * Check All Possible Sources for Vendor Codes
 * Look in Dallas OCR invoices, existing pack configs, and other sources
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

async function checkAllVendorCodeSources() {
  console.log('🔍 Checking All Possible Vendor Code Sources\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get items WITHOUT vendor codes
  console.log('Fetching items without vendor codes...');

  const { data: itemsWithoutCodes } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      category,
      item_pack_configurations!inner(
        id,
        vendor_id,
        vendor_item_code
      )
    `)
    .eq('organization_id', org!.id)
    .is('item_pack_configurations.vendor_item_code', null);

  const uniqueItems = new Map();
  itemsWithoutCodes?.forEach((item: any) => {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, {
        id: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category
      });
    }
  });

  console.log(`Items without vendor codes: ${uniqueItems.size}\n`);

  // SOURCE 1: Check Dallas OCR invoices for vendor item codes
  console.log('═══════════════════════════════════════════════════════');
  console.log('SOURCE 1: Dallas OCR Invoices');
  console.log('═══════════════════════════════════════════════════════\n');

  const { data: dallasLines } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      item_id,
      description,
      vendor_item_code,
      parsed_pack,
      invoice:invoices!inner(
        id,
        venue_id
      )
    `)
    .not('item_id', 'is', null)
    .not('vendor_item_code', 'is', null);

  console.log(`Dallas invoice lines with vendor codes: ${dallasLines?.length || 0}`);

  // Build vendor code map from Dallas invoices
  const dallasVendorMap = new Map<string, string>(); // item_id → vendor_item_code
  dallasLines?.forEach((line: any) => {
    if (line.item_id && line.vendor_item_code) {
      dallasVendorMap.set(line.item_id, line.vendor_item_code);
    }
  });

  let dallasMatches = 0;
  uniqueItems.forEach((item) => {
    if (dallasVendorMap.has(item.id)) {
      dallasMatches++;
    }
  });

  console.log(`Items matched from Dallas invoices: ${dallasMatches}\n`);

  // SOURCE 2: Check if other pack configs for same item have vendor codes
  console.log('═══════════════════════════════════════════════════════');
  console.log('SOURCE 2: Other Pack Configs (Same Item)');
  console.log('═══════════════════════════════════════════════════════\n');

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

  // Check if any item has SOME pack configs with codes and SOME without
  let itemsWithMixedPacks = 0;
  let packsWeCanPopulate = 0;

  uniqueItems.forEach((item) => {
    const packs = packsByItem.get(item.id) || [];
    const packsWithCodes = packs.filter(p => p.vendor_item_code);
    const packsWithoutCodes = packs.filter(p => !p.vendor_item_code);

    if (packsWithCodes.length > 0 && packsWithoutCodes.length > 0) {
      itemsWithMixedPacks++;
      packsWeCanPopulate += packsWithoutCodes.length;
    }
  });

  console.log(`Items with mixed pack configs: ${itemsWithMixedPacks}`);
  console.log(`Pack configs we could populate from sibling packs: ${packsWeCanPopulate}\n`);

  // SOURCE 3: Check invoice_lines for vendor_item_code by description matching
  console.log('═══════════════════════════════════════════════════════');
  console.log('SOURCE 3: Invoice Lines (Description Matching)');
  console.log('═══════════════════════════════════════════════════════\n');

  const { data: allInvoiceLines } = await supabase
    .from('invoice_lines')
    .select('id, description, vendor_item_code, item_id')
    .not('vendor_item_code', 'is', null)
    .not('description', 'is', null);

  console.log(`Total invoice lines with vendor codes: ${allInvoiceLines?.length || 0}`);

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

  console.log(`Unique vendor codes in invoice lines: ${descriptionVendorMap.size}`);

  let descriptionMatches = 0;
  uniqueItems.forEach((item) => {
    const normalized = normalizeItemName(item.name);
    if (descriptionVendorMap.has(normalized)) {
      descriptionMatches++;
    }
  });

  console.log(`Items matched by description: ${descriptionMatches}\n`);

  // SOURCE 4: Check for vendor codes in item SKU field (some might be vendor SKUs)
  console.log('═══════════════════════════════════════════════════════');
  console.log('SOURCE 4: Items with Vendor SKU Patterns');
  console.log('═══════════════════════════════════════════════════════\n');

  let skuLooksLikeVendorCode = 0;
  uniqueItems.forEach((item) => {
    // Check if SKU looks like a vendor code (all digits, or specific patterns)
    if (/^\d+$/.test(item.sku) || item.sku.startsWith('SPWEB') || item.sku.startsWith('VN')) {
      skuLooksLikeVendorCode++;
    }
  });

  console.log(`Items with SKUs that look like vendor codes: ${skuLooksLikeVendorCode}\n`);

  // SUMMARY
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY - POTENTIAL VENDOR CODE SOURCES');
  console.log('═══════════════════════════════════════════════════════\n');

  const totalPotentialMatches = dallasMatches + itemsWithMixedPacks + descriptionMatches;

  console.log(`📊 Items without vendor codes: ${uniqueItems.size}`);
  console.log(`\n🔍 Potential matches found:`);
  console.log(`   Dallas OCR invoices: ${dallasMatches}`);
  console.log(`   Same item, different pack: ${itemsWithMixedPacks}`);
  console.log(`   Invoice description matching: ${descriptionMatches}`);
  console.log(`   SKUs that are vendor codes: ${skuLooksLikeVendorCode}`);
  console.log(`\n   Total potential: ${totalPotentialMatches} items\n`);

  if (totalPotentialMatches > 0) {
    console.log('💡 We can extract more vendor codes from these sources!');
    console.log('   Would you like to create a script to apply these?\n');
  } else {
    console.log('✅ No additional vendor codes found in database.');
    console.log('   Remaining items likely need manual vendor catalog lookup.\n');
  }

  // Show sample of items still without codes
  console.log('Sample items still without vendor codes:');
  Array.from(uniqueItems.values()).slice(0, 20).forEach(item => {
    console.log(`  ${item.sku} - ${item.name} (${item.category})`);
  });
}

checkAllVendorCodeSources().catch(console.error);
