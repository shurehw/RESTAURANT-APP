/**
 * Count All Items
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function countItems() {
  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  console.log(`Organization: ${org?.name} (${org?.id})\n`);

  // Count all items
  const { count: totalCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id);

  console.log(`Total items: ${totalCount}`);

  // Count active items
  const { count: activeCount } = await supabase
    .from('items')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('is_active', true);

  console.log(`Active items: ${activeCount}\n`);

  // Count items with pack configs
  const { data: itemsWithPacks } = await supabase
    .from('items')
    .select(`
      id,
      item_pack_configurations(id)
    `)
    .eq('organization_id', org.id)
    .eq('is_active', true);

  const withPacks = itemsWithPacks?.filter(item =>
    (item as any).item_pack_configurations?.length > 0
  ).length || 0;

  console.log(`Items with pack configs: ${withPacks}`);
  console.log(`Items without pack configs: ${activeCount! - withPacks}\n`);
}

countItems().catch(console.error);
