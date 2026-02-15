/**
 * Generate R365 Items Master Export
 * Creates items list for R365 import
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function generateR365ItemsExport() {
  console.log('📋 Generating R365 Items Master Export\n');

  // Get org
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  console.log(`Organization: ${org?.name}\n`);

  // Fetch all items in batches
  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        sku,
        name,
        category,
        subcategory,
        base_uom,
        r365_measure_type,
        r365_reporting_uom,
        r365_inventory_uom,
        r365_cost_account,
        r365_inventory_account,
        created_at
      `)
      .eq('organization_id', org!.id)
      .eq('is_active', true)
      .order('sku')
      .range(from, from + batchSize - 1);

    if (error || !items || items.length === 0) break;

    allItems = allItems.concat(items);
    from += batchSize;

    if (items.length < batchSize) break;
  }

  console.log(`Total Items: ${allItems.length}\n`);

  // Check for items created today
  const today = new Date().toISOString().split('T')[0];
  const newItems = allItems.filter(item =>
    item.created_at && item.created_at.startsWith(today)
  );

  console.log(`Items Created Today: ${newItems.length}\n`);

  // Generate CSV for ALL items
  const rows: string[] = [];
  rows.push('SKU,Item Name,Category,Subcategory,Measure Type,Base UOM,Reporting UOM,Inventory UOM,Cost Account,Inventory Account');

  allItems.forEach(item => {
    rows.push([
      `"${item.sku}"`,
      `"${item.name}"`,
      `"${item.category || ''}"`,
      `"${item.subcategory || ''}"`,
      `"${item.r365_measure_type || 'Each'}"`,
      `"${item.base_uom || 'ea'}"`,
      `"${item.r365_reporting_uom || item.base_uom || 'ea'}"`,
      `"${item.r365_inventory_uom || item.base_uom || 'ea'}"`,
      `"${item.r365_cost_account || '5000'}"`,
      `"${item.r365_inventory_account || '1400'}"`
    ].join(','));
  });

  const allItemsCsv = rows.join('\n');
  fs.writeFileSync('R365_ITEMS_MASTER.csv', allItemsCsv);

  console.log('✅ All Items Export: R365_ITEMS_MASTER.csv');
  console.log(`   Total items: ${allItems.length}\n`);

  // Generate CSV for NEW items only
  if (newItems.length > 0) {
    const newRows: string[] = [];
    newRows.push('SKU,Item Name,Category,Subcategory,Measure Type,Base UOM,Reporting UOM,Inventory UOM,Cost Account,Inventory Account');

    newItems.forEach(item => {
      newRows.push([
        `"${item.sku}"`,
        `"${item.name}"`,
        `"${item.category || ''}"`,
        `"${item.subcategory || ''}"`,
        `"${item.r365_measure_type || 'Each'}"`,
        `"${item.base_uom || 'ea'}"`,
        `"${item.r365_reporting_uom || item.base_uom || 'ea'}"`,
        `"${item.r365_inventory_uom || item.base_uom || 'ea'}"`,
        `"${item.r365_cost_account || '5000'}"`,
        `"${item.r365_inventory_account || '1400'}"`
      ].join(','));
    });

    const newItemsCsv = newRows.join('\n');
    fs.writeFileSync('R365_ITEMS_NEW_TODAY.csv', newItemsCsv);

    console.log('✅ New Items Export: R365_ITEMS_NEW_TODAY.csv');
    console.log(`   New items: ${newItems.length}\n`);
  }

  // Summary by category
  const byCategory = new Map<string, number>();
  newItems.forEach(item => {
    byCategory.set(item.category, (byCategory.get(item.category) || 0) + 1);
  });

  if (newItems.length > 0) {
    console.log('New Items by Category:');
    Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        console.log(`  ${cat}: ${count}`);
      });
    console.log();
  }
}

generateR365ItemsExport().catch(console.error);
