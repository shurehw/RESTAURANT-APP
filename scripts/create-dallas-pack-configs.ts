/**
 * Create Dallas Pack Configurations from OCR Invoices
 * Extracts pack info from Dallas invoices and creates vendor-specific pack configs
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function createDallasPackConfigs(dryRun: boolean = true) {
  console.log('📦 Creating Dallas Pack Configurations from OCR Invoices\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN' : '⚠️  LIVE MODE'}\n`);

  // Get Dallas venue
  const { data: dallas } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%dallas%')
    .single();

  console.log(`Dallas Venue: ${dallas?.name}\n`);

  // Get all Dallas invoices
  const { data: dallasInvoices } = await supabase
    .from('invoices')
    .select('id, vendor_id, vendor:vendors(id, name)')
    .eq('venue_id', dallas!.id);

  console.log(`Dallas Invoices: ${dallasInvoices?.length || 0}\n`);

  // Get all invoice lines from Dallas with item matches
  const invoiceIds = dallasInvoices?.map(i => i.id) || [];

  console.log('Fetching invoice lines...');

  const { data: allLines } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      invoice_id,
      item_id,
      description,
      normalized_description,
      qty,
      unit_cost,
      parsed_pack
    `)
    .in('invoice_id', invoiceIds)
    .not('item_id', 'is', null); // Only matched items

  console.log(`Matched Invoice Lines: ${allLines?.length || 0}\n`);

  // Build vendor lookup
  const vendorMap = new Map();
  dallasInvoices?.forEach(inv => {
    vendorMap.set(inv.id, (inv.vendor as any));
  });

  // Aggregate by item + vendor + pack configuration
  interface PackConfig {
    itemId: string;
    vendorId: string;
    vendorName: string;
    description: string;
    parsedPack: any;
    packType: string;
    unitsPerPack: number;
    unitSize: number;
    unitSizeUom: string;
    totalQtyOrdered: number;
    orderCount: number;
    avgUnitCost: number;
  }

  const packConfigs = new Map<string, PackConfig>();

  allLines?.forEach(line => {
    const vendor = vendorMap.get(line.invoice_id);
    if (!vendor?.id) return;

    // Parse pack configuration
    const parsed = line.parsed_pack || {};
    const packType = parsed.pack_type || 'case';
    const unitsPerPack = parsed.units_per_pack || 1;
    const unitSize = parsed.unit_size || 1;
    const unitSizeUom = parsed.unit_size_uom || 'ea';

    // Create unique key: item + vendor + pack
    const key = `${line.item_id}_${vendor.id}_${packType}_${unitsPerPack}_${unitSize}_${unitSizeUom}`;

    if (!packConfigs.has(key)) {
      packConfigs.set(key, {
        itemId: line.item_id,
        vendorId: vendor.id,
        vendorName: vendor.name,
        description: line.description,
        parsedPack: parsed,
        packType,
        unitsPerPack,
        unitSize,
        unitSizeUom,
        totalQtyOrdered: 0,
        orderCount: 0,
        avgUnitCost: 0
      });
    }

    const config = packConfigs.get(key)!;
    config.totalQtyOrdered += parseFloat(line.qty || 0);
    config.orderCount++;
    config.avgUnitCost = ((config.avgUnitCost * (config.orderCount - 1)) + parseFloat(line.unit_cost || 0)) / config.orderCount;
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('PACK CONFIGURATION ANALYSIS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Unique Item+Vendor+Pack Combinations: ${packConfigs.size}\n`);

  // Group by vendor
  const byVendor = new Map<string, number>();
  packConfigs.forEach(config => {
    byVendor.set(config.vendorName, (byVendor.get(config.vendorName) || 0) + 1);
  });

  console.log('Pack Configs by Vendor:');
  Array.from(byVendor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([vendor, count]) => {
      console.log(`  ${vendor}: ${count} pack configs`);
    });

  console.log('\n');

  // Show sample configurations
  console.log('═══════════════════════════════════════════════════════');
  console.log('SAMPLE PACK CONFIGURATIONS (First 20)');
  console.log('═══════════════════════════════════════════════════════\n');

  const sampleConfigs = Array.from(packConfigs.values())
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 20);

  sampleConfigs.forEach(config => {
    console.log(`${config.description}`);
    console.log(`  Vendor: ${config.vendorName}`);
    console.log(`  Pack: ${config.unitsPerPack} x ${config.unitSize}${config.unitSizeUom} (${config.packType})`);
    console.log(`  Orders: ${config.orderCount} | Avg Cost: $${config.avgUnitCost.toFixed(2)}\n`);
  });

  if (!dryRun) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('⚠️  CREATING PACK CONFIGURATIONS');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check existing pack configs to avoid duplicates
    const itemIds = Array.from(new Set(Array.from(packConfigs.values()).map(c => c.itemId)));

    console.log('Checking for existing pack configs...');

    const existingPacks = new Map<string, boolean>();
    const batchSize = 100;

    for (let i = 0; i < itemIds.length; i += batchSize) {
      const batch = itemIds.slice(i, i + batchSize);
      const { data: existing } = await supabase
        .from('item_pack_configurations')
        .select('item_id, vendor_id, pack_type, units_per_pack, unit_size, unit_size_uom')
        .in('item_id', batch);

      existing?.forEach(pack => {
        const key = `${pack.item_id}_${pack.vendor_id}_${pack.pack_type}_${pack.units_per_pack}_${pack.unit_size}_${pack.unit_size_uom}`;
        existingPacks.set(key, true);
      });
    }

    console.log(`Found ${existingPacks.size} existing pack configs\n`);

    // Filter out existing configs
    const newConfigs = Array.from(packConfigs.entries())
      .filter(([key]) => !existingPacks.has(key))
      .map(([_, config]) => config);

    console.log(`New pack configs to create: ${newConfigs.length}\n`);

    let created = 0;
    let failed = 0;

    for (const config of newConfigs) {
      // Calculate conversion factor
      const conversionFactor = config.unitsPerPack * config.unitSize;

      const { error } = await supabase
        .from('item_pack_configurations')
        .insert({
          item_id: config.itemId,
          vendor_id: config.vendorId,
          pack_type: config.packType,
          units_per_pack: config.unitsPerPack,
          unit_size: config.unitSize,
          unit_size_uom: config.unitSizeUom,
          conversion_factor: conversionFactor,
          display_name: `${config.unitsPerPack} x ${config.unitSize}${config.unitSizeUom}`,
          is_active: true
        });

      if (error) {
        console.error(`❌ Failed: ${config.description} - ${error.message}`);
        failed++;
      } else {
        created++;
        if (created % 50 === 0) {
          console.log(`  ✅ Created ${created} pack configs...`);
        }
      }
    }

    console.log(`\n✅ Creation complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped (existing): ${packConfigs.size - newConfigs.length}\n`);

  } else {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DRY RUN COMPLETE');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('This will create:');
    console.log(`  ✅ ${packConfigs.size} pack configurations`);
    console.log(`  ✅ Link Dallas items to Dallas vendors`);
    console.log(`  ✅ Enable proper vendor matching for R365 export\n`);

    console.log('To create pack configs, run:');
    console.log('  npx tsx scripts/create-dallas-pack-configs.ts --live\n');
  }
}

// Parse command line args
const isLive = process.argv.includes('--live');
createDallasPackConfigs(!isLive).catch(console.error);
