import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixMissingR365Fields() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Fetching items with missing R365 fields...');

  // Get ALL items (no limit)
  let allItems: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching items:', error);
      break;
    }

    if (data && data.length > 0) {
      allItems.push(...data);
      offset += batchSize;
      console.log(`Fetched ${allItems.length} items so far...`);
    }

    if (!data || data.length < batchSize) {
      hasMore = false;
    }
  }

  console.log(`\nTotal items fetched: ${allItems.length}`);

  // Find items with missing fields
  const missingReportingUOM = allItems.filter(i => !i.r365_reporting_uom || i.r365_reporting_uom === '');
  const missingInventoryUOM = allItems.filter(i => !i.r365_inventory_uom || i.r365_inventory_uom === '');
  const missingCostAccount = allItems.filter(i => !i.r365_cost_account || i.r365_cost_account === '');
  const missingInventoryAccount = allItems.filter(i => !i.r365_inventory_account || i.r365_inventory_account === '');

  console.log('\n=== MISSING FIELDS ===');
  console.log(`Reporting UOM: ${missingReportingUOM.length} items`);
  console.log(`Inventory UOM: ${missingInventoryUOM.length} items`);
  console.log(`Cost Account: ${missingCostAccount.length} items`);
  console.log(`Inventory Account: ${missingInventoryAccount.length} items`);

  // Show sample items missing fields
  if (missingReportingUOM.length > 0) {
    console.log('\nSample items missing Reporting UOM:');
    missingReportingUOM.slice(0, 5).forEach(i => {
      console.log(`  - ${i.name} (base_uom: ${i.base_uom})`);
    });
  }

  if (missingCostAccount.length > 0) {
    console.log('\nSample items missing Cost Account:');
    missingCostAccount.slice(0, 5).forEach(i => {
      console.log(`  - ${i.name} (category: ${i.category})`);
    });
  }

  // Fix missing UOMs - use base_uom
  console.log('\n=== FIXING MISSING UOMS ===');
  for (const item of missingReportingUOM) {
    const uom = item.base_uom || 'Each';
    const { error } = await supabase
      .from('items')
      .update({
        r365_reporting_uom: uom,
        r365_inventory_uom: uom
      })
      .eq('id', item.id);

    if (error) {
      console.error(`Error updating ${item.name}:`, error);
    } else {
      console.log(`✓ Fixed UOM for: ${item.name} → ${uom}`);
    }
  }

  // Fix missing Cost/Inventory Accounts based on category
  console.log('\n=== FIXING MISSING ACCOUNTS ===');

  function getCostAndInventoryAccount(category: string): { cost: string; inventory: string } {
    const cat = category?.toLowerCase() || '';

    if (cat.includes('meat')) return { cost: 'Meat Cost', inventory: 'Meat Inventory' };
    if (cat.includes('seafood')) return { cost: 'Seafood Cost', inventory: 'Seafood Inventory' };
    if (cat.includes('produce')) return { cost: 'Produce Cost', inventory: 'Produce Inventory' };
    if (cat.includes('dairy')) return { cost: 'Dairy Cost', inventory: 'Dairy Inventory' };
    if (cat.includes('grocery')) return { cost: 'Grocery Cost', inventory: 'Grocery Inventory' };
    if (cat.includes('bakery')) return { cost: 'Bakery Cost', inventory: 'Bakery Inventory' };
    if (cat.includes('beer')) return { cost: 'Beer Cost', inventory: 'Beer Inventory' };
    if (cat.includes('wine')) return { cost: 'Wine Cost', inventory: 'Wine Inventory' };
    if (cat.includes('liquor') || cat.includes('spirit')) return { cost: 'Liquor Cost', inventory: 'Liquor Inventory' };

    return { cost: 'Food Cost', inventory: 'Food Inventory' };
  }

  for (const item of missingCostAccount) {
    const accounts = getCostAndInventoryAccount(item.category);

    const { error } = await supabase
      .from('items')
      .update({
        r365_cost_account: accounts.cost,
        r365_inventory_account: accounts.inventory
      })
      .eq('id', item.id);

    if (error) {
      console.error(`Error updating accounts for ${item.name}:`, error);
    } else {
      console.log(`✓ Fixed accounts for: ${item.name} → ${accounts.cost}`);
    }
  }

  console.log('\n✓ All missing R365 fields have been fixed!');
}

fixMissingR365Fields().catch(console.error);
