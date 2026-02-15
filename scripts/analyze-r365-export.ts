/**
 * Analyze R365 Export
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeExport() {
  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  console.log('📊 R365 Export Analysis\n');

  // Count total items
  const { count: totalItems } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('is_active', true);

  console.log(`Total Active Items: ${totalItems}`);

  // Count total pack configs
  const { count: totalPacks } = await supabase
    .from('item_pack_configurations')
    .select('item:items!inner(organization_id)', { count: 'exact', head: true })
    .eq('item.organization_id', org.id)
    .eq('is_active', true);

  console.log(`Total Pack Configurations: ${totalPacks}`);

  // Count items by pack config count using manual query
  // Fetch all items with their pack counts in batches
  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batch } = await supabase
      .from('items')
      .select('id, sku, name, item_pack_configurations(id)')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .range(from, from + batchSize - 1);

    if (!batch || batch.length === 0) break;

    allItems = allItems.concat(batch);
    from += batchSize;

    if (batch.length < batchSize) break;
  }

  const itemsWithNoPacks = allItems.filter(item =>
    !(item as any).item_pack_configurations || (item as any).item_pack_configurations.length === 0
  );

  const itemsWith1Pack = allItems.filter(item =>
    (item as any).item_pack_configurations?.length === 1
  );

  const itemsWithMultiplePacks = allItems.filter(item =>
    (item as any).item_pack_configurations?.length > 1
  );

  console.log(`\nBreakdown by Pack Configurations:`);
  console.log(`  Items with 0 packs: ${itemsWithNoPacks.length}`);
  console.log(`  Items with 1 pack: ${itemsWith1Pack.length}`);
  console.log(`  Items with 2+ packs: ${itemsWithMultiplePacks.length}`);

  // Read CSV to verify
  const csvContent = fs.readFileSync('R365_PURCHASE_ITEMS.csv', 'utf-8');
  const csvLines = csvContent.split('\n').filter(line => line.trim());
  const csvRows = csvLines.length - 1; // Exclude header

  console.log(`\n📄 R365_PURCHASE_ITEMS.csv:`);
  console.log(`  Total rows (excluding header): ${csvRows}`);
  console.log(`  Expected: ${totalPacks} pack configs + ${itemsWithNoPacks.length} items without packs`);
  console.log(`  Actual: ${csvRows}`);

  if (csvRows === totalPacks! + itemsWithNoPacks.length) {
    console.log(`  ✅ PERFECT MATCH!\n`);
  } else if (csvRows === totalPacks) {
    console.log(`  ⚠️  Missing ${itemsWithNoPacks.length} items without pack configs\n`);
  } else {
    console.log(`  ⚠️  Count mismatch - review needed\n`);
  }

  // Show sample items without packs
  if (itemsWithNoPacks.length > 0) {
    console.log(`Items Without Pack Configs (first 10):`);
    itemsWithNoPacks.slice(0, 10).forEach(item => {
      console.log(`  ${item.sku} - ${item.name}`);
    });
    console.log();
  }

  // Count vendor codes
  const linesWithVendorCode = csvLines.filter(line => {
    const cols = line.split(',');
    return cols[2] && cols[2] !== '""' && cols[2] !== '"Vendor Code"';
  }).length;

  console.log(`Purchase Items with Vendor Codes: ${linesWithVendorCode}`);
  console.log(`Purchase Items without Vendor Codes: ${csvRows - linesWithVendorCode}\n`);
}

analyzeExport().catch(console.error);
