/**
 * Check New Items
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNewItems() {
  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('name', '%wood%')
    .single();

  // Get recently created items (last 1 hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: recentItems } = await supabase
    .from('items')
    .select(`
      id,
      sku,
      name,
      created_at,
      item_pack_configurations(id, vendor_item_code)
    `)
    .eq('organization_id', org.id)
    .gte('created_at', oneHourAgo)
    .limit(10);

  console.log(`Recently created items (last hour): ${recentItems?.length || 0}\n`);

  if (recentItems && recentItems.length > 0) {
    recentItems.forEach(item => {
      const packs = (item as any).item_pack_configurations || [];
      console.log(`${item.sku} - ${item.name}`);
      console.log(`  Pack configs: ${packs.length}`);
      if (packs.length > 0) {
        console.log(`  Vendor code: ${packs[0].vendor_item_code}`);
      }
      console.log();
    });
  }

  // Count pack configs created recently
  const { count: recentPackCount } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  console.log(`Recently created pack configs: ${recentPackCount}\n`);

  // Total pack configs
  const { count: totalPackCount } = await supabase
    .from('item_pack_configurations')
    .select('*', { count: 'exact', head: true });

  console.log(`Total pack configs: ${totalPackCount}`);
}

checkNewItems().catch(console.error);
