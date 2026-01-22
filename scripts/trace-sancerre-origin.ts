import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function traceSancerre() {
  console.log('\n=== Tracing Origin of 2023 Sancerre, Dezat ===\n');

  const { data: item } = await supabase
    .from('items')
    .select('*')
    .eq('sku', 'DEZAT-SANC-23')
    .single();

  if (!item) {
    console.log('Item not found');
    return;
  }

  console.log('Item Metadata:');
  console.log(`  Created: ${item.created_at}`);
  console.log(`  Updated: ${item.updated_at}`);
  console.log(`  Organization ID: ${item.organization_id}`);
  console.log(`  Is Active: ${item.is_active}`);

  // Check if there are any similar items created around the same time
  const createdDate = new Date(item.created_at);
  const startDate = new Date(createdDate.getTime() - 60000); // 1 min before
  const endDate = new Date(createdDate.getTime() + 60000);   // 1 min after

  const { data: similarTiming } = await supabase
    .from('items')
    .select('name, sku, category, created_at')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString())
    .order('created_at');

  console.log(`\nItems created within 1 minute (${startDate.toISOString()} to ${endDate.toISOString()}):`);
  console.log(`Total: ${similarTiming?.length || 0}\n`);

  similarTiming?.slice(0, 20).forEach(i => {
    console.log(`  ${i.name} (${i.sku}) - ${i.category} - ${i.created_at}`);
  });

  // Check all items with category "food" (unusual for beverages)
  const { data: foodItems } = await supabase
    .from('items')
    .select('name, sku, created_at')
    .eq('category', 'food')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  console.log(`\n\nAll items with category "food": ${foodItems?.length || 0}`);
  foodItems?.forEach(i => {
    console.log(`  ${i.name} (${i.sku}) - ${i.created_at}`);
  });
}

traceSancerre().catch(console.error);
