/**
 * Analyze Remaining Items Without Vendor Codes
 * Where did they come from? Are they even being used?
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeRemainingItems() {
  console.log('🔍 Analyzing Remaining Items Without Vendor Codes\n');

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
      subcategory,
      created_at,
      updated_at,
      is_active,
      item_pack_configurations!inner(
        id,
        vendor_id,
        vendor_item_code,
        vendor:vendors(name)
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
        category: item.category,
        subcategory: item.subcategory,
        created_at: item.created_at,
        updated_at: item.updated_at,
        is_active: item.is_active,
        pack_configs: item.item_pack_configurations || []
      });
    }
  });

  console.log(`Unique items without vendor codes: ${uniqueItems.size}\n`);

  // ANALYSIS 1: When were these items created?
  console.log('═══════════════════════════════════════════════════════');
  console.log('ANALYSIS 1: Item Creation Dates');
  console.log('═══════════════════════════════════════════════════════\n');

  const creationBuckets = new Map<string, number>();
  const now = new Date();

  uniqueItems.forEach((item) => {
    const created = new Date(item.created_at);
    const monthsAgo = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 30));

    let bucket;
    if (monthsAgo < 1) bucket = 'Last month';
    else if (monthsAgo < 3) bucket = '1-3 months ago';
    else if (monthsAgo < 6) bucket = '3-6 months ago';
    else if (monthsAgo < 12) bucket = '6-12 months ago';
    else bucket = 'Over 1 year ago';

    creationBuckets.set(bucket, (creationBuckets.get(bucket) || 0) + 1);
  });

  console.log('When were these items created?');
  const bucketOrder = ['Last month', '1-3 months ago', '3-6 months ago', '6-12 months ago', 'Over 1 year ago'];
  bucketOrder.forEach(bucket => {
    const count = creationBuckets.get(bucket) || 0;
    if (count > 0) {
      console.log(`  ${bucket}: ${count} items`);
    }
  });
  console.log();

  // ANALYSIS 2: Category breakdown
  console.log('═══════════════════════════════════════════════════════');
  console.log('ANALYSIS 2: Category Breakdown');
  console.log('═══════════════════════════════════════════════════════\n');

  const byCategory = new Map<string, number>();
  uniqueItems.forEach((item) => {
    const cat = item.category || 'unknown';
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
  });

  console.log('Items by category:');
  Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
  console.log();

  // ANALYSIS 3: Are they in purchase logs at all?
  console.log('═══════════════════════════════════════════════════════');
  console.log('ANALYSIS 3: Purchase History Check');
  console.log('═══════════════════════════════════════════════════════\n');

  const itemIds = Array.from(uniqueItems.keys());

  // Check check_items (are they being sold?)
  const { data: checkItems } = await supabase
    .from('check_items')
    .select('item_id', { count: 'exact', head: true })
    .in('item_id', itemIds);

  // Check invoice_lines (are they being purchased?)
  const { data: invoiceItems } = await supabase
    .from('invoice_lines')
    .select('item_id', { count: 'exact', head: true })
    .in('item_id', itemIds)
    .not('item_id', 'is', null);

  // Get detailed check on which items are used
  const { data: usedInChecks } = await supabase
    .from('check_items')
    .select('item_id')
    .in('item_id', itemIds);

  const { data: usedInInvoices } = await supabase
    .from('invoice_lines')
    .select('item_id')
    .in('item_id', itemIds)
    .not('item_id', 'is', null);

  const usedInChecksSet = new Set(usedInChecks?.map(ci => ci.item_id) || []);
  const usedInInvoicesSet = new Set(usedInInvoices?.map(il => il.item_id) || []);

  let notUsedAnywhere = 0;
  let usedInChecksOnly = 0;
  let usedInInvoicesOnly = 0;
  let usedInBoth = 0;

  uniqueItems.forEach((item) => {
    const inChecks = usedInChecksSet.has(item.id);
    const inInvoices = usedInInvoicesSet.has(item.id);

    if (!inChecks && !inInvoices) notUsedAnywhere++;
    else if (inChecks && !inInvoices) usedInChecksOnly++;
    else if (!inChecks && inInvoices) usedInInvoicesOnly++;
    else usedInBoth++;
  });

  console.log('Usage analysis:');
  console.log(`  Used in both checks AND invoices: ${usedInBoth}`);
  console.log(`  Used in checks only (sold but not purchased): ${usedInChecksOnly}`);
  console.log(`  Used in invoices only (purchased but not sold): ${usedInInvoicesOnly}`);
  console.log(`  NOT used anywhere (no sales, no purchases): ${notUsedAnywhere}\n`);

  // ANALYSIS 4: Are they active?
  console.log('═══════════════════════════════════════════════════════');
  console.log('ANALYSIS 4: Active Status');
  console.log('═══════════════════════════════════════════════════════\n');

  let activeItems = 0;
  let inactiveItems = 0;

  uniqueItems.forEach((item) => {
    if (item.is_active) activeItems++;
    else inactiveItems++;
  });

  console.log(`Active items: ${activeItems}`);
  console.log(`Inactive items: ${inactiveItems}\n`);

  // ANALYSIS 5: Sample of items with no usage
  if (notUsedAnywhere > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('SAMPLE: Items Never Used (First 30)');
    console.log('═══════════════════════════════════════════════════════\n');

    let count = 0;
    for (const [id, item] of uniqueItems) {
      const inChecks = usedInChecksSet.has(id);
      const inInvoices = usedInInvoicesSet.has(id);

      if (!inChecks && !inInvoices) {
        const created = new Date(item.created_at).toISOString().split('T')[0];
        console.log(`${item.sku} - ${item.name}`);
        console.log(`  Category: ${item.category} | Created: ${created} | Active: ${item.is_active}`);

        count++;
        if (count >= 30) break;
      }
    }
    console.log();
  }

  // SUMMARY
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`📊 Total items without vendor codes: ${uniqueItems.size}\n`);

  console.log('Likely reasons these have no vendor codes:');
  console.log(`  1. Never purchased (not in invoices): ~${notUsedAnywhere + usedInChecksOnly} items`);
  console.log(`  2. Inactive/legacy items: ${inactiveItems} items`);
  console.log(`  3. House-made or composite items: unknown`);
  console.log(`  4. Low-volume items outside our 13-month window: unknown\n`);

  const cleanupCandidates = notUsedAnywhere;
  console.log(`💡 Potential cleanup: ${cleanupCandidates} items have never been used in checks OR invoices`);
  console.log('   These could potentially be marked inactive or archived.\n');
}

analyzeRemainingItems().catch(console.error);
