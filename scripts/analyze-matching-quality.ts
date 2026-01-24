import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyze() {
  // Find invoices WITH line items
  const { data: invoicesWithLines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, description, item_id')
    .order('created_at', { ascending: false })
    .limit(100);

  const invoiceIds = [...new Set(invoicesWithLines?.map(l => l.invoice_id))];

  console.log('\n📊 MATCHING QUALITY ANALYSIS');
  console.log('━'.repeat(60));
  console.log(`Total invoice lines analyzed: ${invoicesWithLines?.length || 0}`);
  console.log(`Invoices: ${invoiceIds.length}`);

  const matched = invoicesWithLines?.filter(l => l.item_id) || [];
  const unmatched = invoicesWithLines?.filter(l => !l.item_id) || [];

  console.log(`\n✅ Matched: ${matched.length} (${((matched.length / (invoicesWithLines?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`❌ Unmatched: ${unmatched.length} (${((unmatched.length / (invoicesWithLines?.length || 1)) * 100).toFixed(1)}%)`);

  // Sample unmatched items
  console.log('\n\n🔍 SAMPLE UNMATCHED ITEMS (need better matching or creation):');
  console.log('━'.repeat(60));
  unmatched.slice(0, 15).forEach((line, idx) => {
    console.log(`${idx + 1}. ${line.description}`);
  });

  // Get recently created items to check quality
  const { data: recentItems } = await supabase
    .from('items')
    .select('id, name, sku, category, subcategory, base_uom, gl_account_id, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('\n\n📦 RECENT ITEM CREATION QUALITY');
  console.log('━'.repeat(60));

  let itemsWithGL = 0;
  let itemsWithCategory = 0;
  let itemsWithSubcategory = 0;
  let itemsWithUOM = 0;

  recentItems?.forEach(item => {
    if (item.gl_account_id) itemsWithGL++;
    if (item.category) itemsWithCategory++;
    if (item.subcategory) itemsWithSubcategory++;
    if (item.base_uom) itemsWithUOM++;
  });

  const total = recentItems?.length || 1;
  console.log(`Total items: ${total}`);
  console.log(`✅ With GL Account: ${itemsWithGL} (${((itemsWithGL / total) * 100).toFixed(0)}%)`);
  console.log(`✅ With Category: ${itemsWithCategory} (${((itemsWithCategory / total) * 100).toFixed(0)}%)`);
  console.log(`✅ With Subcategory: ${itemsWithSubcategory} (${((itemsWithSubcategory / total) * 100).toFixed(0)}%)`);
  console.log(`✅ With UOM: ${itemsWithUOM} (${((itemsWithUOM / total) * 100).toFixed(0)}%)`);

  console.log('\n\n📋 SAMPLE RECENT ITEMS:');
  console.log('━'.repeat(60));
  recentItems?.slice(0, 10).forEach(item => {
    const gl = item.gl_account_id ? '✅' : '❌';
    const cat = item.category || '❓';
    const subcat = item.subcategory || '';
    console.log(`${gl} ${item.name}`);
    console.log(`   Category: ${cat}${subcat ? ` > ${subcat}` : ''} | UOM: ${item.base_uom || '❓'}`);
  });

  // Check for pack configuration data
  const { data: packConfigs } = await supabase
    .from('item_pack_configurations')
    .select('item_id, pack_type, units_per_pack, unit_size, unit_size_uom')
    .in('item_id', recentItems?.map(i => i.id) || []);

  console.log(`\n📦 Pack Configurations: ${packConfigs?.length || 0} found for recent items`);

  if (packConfigs && packConfigs.length > 0) {
    console.log('\nSample pack configs:');
    packConfigs.slice(0, 5).forEach(pack => {
      const item = recentItems?.find(i => i.id === pack.item_id);
      console.log(`  • ${item?.name}: ${pack.pack_type} - ${pack.units_per_pack}x ${pack.unit_size}${pack.unit_size_uom}`);
    });
  }
}

analyze();
