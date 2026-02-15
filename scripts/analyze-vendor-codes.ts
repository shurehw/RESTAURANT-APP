/**
 * Analyze Vendor Code Coverage
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeVendorCodes() {
  console.log('🔍 Analyzing Vendor Code Coverage\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Fetch all pack configs with item info in batches
  let allPacks: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batch } = await supabase
      .from('item_pack_configurations')
      .select(`
        id,
        vendor_item_code,
        created_at,
        item:items!inner(
          id,
          sku,
          name,
          organization_id,
          created_at
        )
      `)
      .eq('item.organization_id', org.id)
      .eq('is_active', true)
      .range(from, from + batchSize - 1);

    if (!batch || batch.length === 0) break;

    allPacks = allPacks.concat(batch);
    from += batchSize;

    if (batch.length < batchSize) break;
  }

  console.log(`Total Pack Configurations: ${allPacks.length}\n`);

  // Categorize by vendor code presence
  const withCode = allPacks.filter(p => p.vendor_item_code);
  const withoutCode = allPacks.filter(p => !p.vendor_item_code);

  console.log(`Pack Configs WITH vendor codes: ${withCode.length}`);
  console.log(`Pack Configs WITHOUT vendor codes: ${withoutCode.length}\n`);

  // Check recent items (created in last 2 hours)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const recentPacks = allPacks.filter(p =>
    (p.item as any).created_at >= twoHoursAgo
  );

  const recentWithCode = recentPacks.filter(p => p.vendor_item_code);
  const recentWithoutCode = recentPacks.filter(p => !p.vendor_item_code);

  console.log('Recently Created Items (last 2 hours):');
  console.log(`  Total pack configs: ${recentPacks.length}`);
  console.log(`  With vendor code: ${recentWithCode.length}`);
  console.log(`  Without vendor code: ${recentWithoutCode.length}\n`);

  // Older items
  const olderPacks = allPacks.filter(p =>
    (p.item as any).created_at < twoHoursAgo
  );

  const olderWithCode = olderPacks.filter(p => p.vendor_item_code);
  const olderWithoutCode = olderPacks.filter(p => !p.vendor_item_code);

  console.log('Older Items (created before last 2 hours):');
  console.log(`  Total pack configs: ${olderPacks.length}`);
  console.log(`  With vendor code: ${olderWithCode.length}`);
  console.log(`  Without vendor code: ${olderWithoutCode.length}\n`);

  // Show sample items without vendor codes
  console.log('═══════════════════════════════════════════════════════');
  console.log('Sample Items WITHOUT Vendor Codes (First 20)');
  console.log('═══════════════════════════════════════════════════════\n');

  // Get unique items from packs without codes
  const itemsWithoutCodes = new Map<string, any>();
  withoutCode.forEach(pack => {
    const item = (pack.item as any);
    if (!itemsWithoutCodes.has(item.id)) {
      itemsWithoutCodes.set(item.id, {
        sku: item.sku,
        name: item.name,
        created_at: item.created_at,
        pack_count: 0
      });
    }
    itemsWithoutCodes.get(item.id)!.pack_count++;
  });

  const sampleItems = Array.from(itemsWithoutCodes.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  sampleItems.forEach(item => {
    const age = new Date(item.created_at).toISOString().split('T')[0];
    console.log(`${item.sku} - ${item.name}`);
    console.log(`  Created: ${age} | Pack configs: ${item.pack_count}\n`);
  });

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('The items WITHOUT vendor codes come from:');
  console.log(`  1. ${olderWithoutCode.length} pack configs from older items`);
  console.log(`     (Items created before the import)`);
  console.log(`  2. ${recentWithoutCode.length} pack configs from recent items`);
  console.log(`     (Should be minimal if import worked correctly)\n`);

  console.log('Why older items lack vendor codes:');
  console.log('  - Original items may not have had vendor SKUs in source data');
  console.log('  - Pack configs created manually without vendor codes');
  console.log('  - Items that weren\'t in the purchase logs\n');

  console.log('To add vendor codes for remaining items:');
  console.log('  1. Match more items from purchase logs (name-based matching)');
  console.log('  2. Manually add vendor SKUs for custom/house items');
  console.log('  3. Get vendor codes from vendor catalogs\n');
}

analyzeVendorCodes().catch(console.error);
