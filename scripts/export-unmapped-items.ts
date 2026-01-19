/**
 * Export unmapped invoice items for catalog creation
 * Format: Name | Measure | T Reporting | Item Category | Number | Cost Account | Inventory Account | Inventory Level | Cost Update | Key Item
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface UnmappedItem {
  vendor_name: string;
  vendor_item_code: string | null;
  description: string;
  qty: number;
  unit_cost: number;
  invoice_number: string;
  invoice_date: string;
  occurrence_count: number;
}

/**
 * Infer category from description keywords
 */
function inferCategory(description: string): string {
  const desc = description.toLowerCase();

  // Beverage keywords
  if (desc.match(/\b(wine|beer|vodka|whiskey|tequila|gin|rum|liquor|spirit|champagne|prosecco|sake|soju)\b/)) {
    return 'Liquor';
  }
  if (desc.match(/\b(juice|soda|coffee|tea|syrup|mixer|tonic|cola)\b/)) {
    return 'Beverage';
  }

  // Protein
  if (desc.match(/\b(beef|chicken|pork|lamb|fish|salmon|tuna|shrimp|lobster|scallop|steak|ribeye|tenderloin|brisket)\b/)) {
    return 'Protein';
  }

  // Produce
  if (desc.match(/\b(lettuce|tomato|onion|garlic|potato|carrot|celery|pepper|mushroom|herb|basil|cilantro|parsley|lemon|lime|orange|apple|berry|fruit|vegetable)\b/)) {
    return 'Produce';
  }

  // Dairy
  if (desc.match(/\b(milk|cream|cheese|butter|yogurt|egg|eggs)\b/)) {
    return 'Dairy';
  }

  // Dry Goods
  if (desc.match(/\b(flour|sugar|salt|rice|pasta|bread|oil|vinegar|sauce|spice|seasoning)\b/)) {
    return 'Dry Goods';
  }

  // Paper/Supplies
  if (desc.match(/\b(napkin|towel|cup|plate|fork|knife|spoon|container|bag|wrap|foil|glove|box)\b/)) {
    return 'Paper/Supplies';
  }

  // Cleaning
  if (desc.match(/\b(soap|detergent|sanitizer|cleaner|bleach|chemical)\b/)) {
    return 'Cleaning';
  }

  return 'Other';
}

/**
 * Infer unit of measure from description
 */
function inferUOM(description: string, qty: number): string {
  const desc = description.toLowerCase();

  if (desc.match(/\b(case|cs|bx|box)\b/)) return 'Case';
  if (desc.match(/\b(lb|lbs|pound|#)\b/)) return 'Pound';
  if (desc.match(/\b(oz|ounce)\b/)) return 'Ounce';
  if (desc.match(/\b(gal|gallon)\b/)) return 'Gallon';
  if (desc.match(/\b(liter|litre|l)\b/)) return 'Liter';
  if (desc.match(/\b(bottle|btl|750ml)\b/)) return 'Bottle';
  if (desc.match(/\b(bag)\b/)) return 'Bag';
  if (desc.match(/\b(each|ea)\b/)) return 'Each';

  // Default based on quantity
  if (qty % 1 === 0 && qty < 100) return 'Each';

  return 'Each';
}

/**
 * Clean description for item name
 */
function cleanDescription(desc: string): string {
  return desc
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-\.\,\/\(\)]/g, '')
    .trim()
    .substring(0, 100); // Limit length
}

async function exportUnmappedItems() {
  console.log('\n📊 Exporting unmapped invoice items...\n');

  // Find h.wood organization
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  if (!org) {
    console.error('❌ h.wood organization not found');
    return;
  }

  console.log(`✅ Organization: ${org.name}\n`);

  // Get all venues for h.wood
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name')
    .eq('organization_id', org.id);

  if (!venues || venues.length === 0) {
    console.error('❌ No venues found');
    return;
  }

  const venueIds = venues.map(v => v.id);

  // Get all invoice lines that are NOT mapped to items
  console.log('🔍 Finding unmapped invoice items...\n');

  const { data: unmappedLines } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      item_id,
      invoice:invoices!inner(
        id,
        invoice_number,
        invoice_date,
        venue_id,
        vendor:vendors(name)
      )
    `)
    .in('invoice.venue_id', venueIds)
    .is('item_id', null);

  if (!unmappedLines || unmappedLines.length === 0) {
    console.log('✅ All items are mapped! No export needed.\n');
    return;
  }

  console.log(`Found ${unmappedLines.length} unmapped line items\n`);

  // Group by description to count occurrences
  const itemMap = new Map<string, UnmappedItem>();

  for (const line of unmappedLines as any[]) {
    const key = line.description.toLowerCase().trim();

    if (itemMap.has(key)) {
      const existing = itemMap.get(key)!;
      existing.occurrence_count++;
      // Update with most recent cost
      if (line.invoice.invoice_date > existing.invoice_date) {
        existing.unit_cost = line.unit_cost;
        existing.invoice_date = line.invoice.invoice_date;
        existing.invoice_number = line.invoice.invoice_number;
      }
    } else {
      itemMap.set(key, {
        vendor_name: line.invoice.vendor?.name || 'Unknown',
        vendor_item_code: null,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unit_cost,
        invoice_number: line.invoice.invoice_number,
        invoice_date: line.invoice.invoice_date,
        occurrence_count: 1,
      });
    }
  }

  // Convert to array and sort by occurrence
  const items = Array.from(itemMap.values())
    .sort((a, b) => b.occurrence_count - a.occurrence_count);

  console.log(`📦 Unique items: ${items.length}\n`);

  // Generate CSV in required format
  const headers = [
    'Name',
    'Measure',
    'T Reporting',
    'Item Category',
    'Number',
    'Cost Account',
    'Inventory Account',
    'Inventory Level',
    'Cost Update',
    'Key Item',
    'Vendor',
    'Last Cost',
    'Occurrences',
  ];

  const rows = items.map((item, index) => {
    const category = inferCategory(item.description);
    const uom = inferUOM(item.description, item.qty);
    const name = cleanDescription(item.description);
    const itemNumber = `IMP-${String(index + 1).padStart(5, '0')}`;

    return [
      name,                    // Name
      uom,                     // Measure
      '',                      // T Reporting (empty for now)
      category,                // Item Category
      itemNumber,              // Number (auto-generated)
      '',                      // Cost Account (empty)
      '',                      // Inventory Account (empty)
      'Perpetual',             // Inventory Level
      'Auto',                  // Cost Update
      'No',                    // Key Item
      item.vendor_name,        // Vendor (for reference)
      item.unit_cost.toFixed(2), // Last Cost (for reference)
      item.occurrence_count,   // Occurrences (for reference)
    ];
  });

  // Create CSV
  const csv = [
    headers.join('\t'),
    ...rows.map(row => row.join('\t')),
  ].join('\n');

  // Save to file
  const filename = `unmapped-items-${new Date().toISOString().split('T')[0]}.csv`;
  const filepath = path.join(process.cwd(), filename);
  fs.writeFileSync(filepath, csv, 'utf-8');

  console.log(`✅ Export complete!\n`);
  console.log(`📄 File: ${filename}`);
  console.log(`📊 Total items: ${items.length}\n`);

  // Show top 10 by occurrence
  console.log('🔥 Top 10 items by occurrence:\n');
  items.slice(0, 10).forEach((item, i) => {
    console.log(`${i + 1}. ${item.description}`);
    console.log(`   Vendor: ${item.vendor_name}`);
    console.log(`   Cost: $${item.unit_cost.toFixed(2)} | Occurrences: ${item.occurrence_count}`);
    console.log(`   Category: ${inferCategory(item.description)} | UOM: ${inferUOM(item.description, item.qty)}\n`);
  });

  console.log(`\n💡 Next steps:`);
  console.log(`   1. Review ${filename}`);
  console.log(`   2. Update categories/UOMs as needed`);
  console.log(`   3. Import into items catalog`);
  console.log(`   4. Map vendor items to imported items\n`);
}

exportUnmappedItems().catch(console.error);
