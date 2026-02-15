/**
 * Generate R365 UOM Conversion Guide
 * Creates a comprehensive guide showing how each item's UOMs convert
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ItemUOM {
  sku: string;
  name: string;
  category: string;
  base_uom: string;
  measure_type: string;
  packs: Array<{
    pack_type: string;
    display_name: string;
    units_per_pack: number;
    unit_size: number;
    unit_size_uom: string;
    conversion_factor: number;
    vendor_item_code: string | null;
  }>;
}

async function generateUOMGuide() {
  console.log('📊 Generating R365 UOM Conversion Guide\n');

  // Get h.wood org
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .ilike('name', '%wood%')
    .single();

  if (!org) {
    console.error('❌ Organization not found');
    return;
  }

  // Fetch all items with pack configurations (with pagination)
  let allItems: any[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: items, error } = await supabase
      .from('items')
      .select(`
        sku,
        name,
        category,
        base_uom,
        r365_measure_type,
        r365_reporting_uom,
        r365_inventory_uom,
        item_pack_configurations(
          pack_type,
          display_name,
          units_per_pack,
          unit_size,
          unit_size_uom,
          conversion_factor,
          vendor_item_code
        )
      `)
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .order('category')
      .order('name')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('❌ Error fetching items:', error);
      return;
    }

    if (!items || items.length === 0) {
      hasMore = false;
    } else {
      allItems = allItems.concat(items);
      from += batchSize;
      hasMore = items.length === batchSize;
    }
  }

  const items = allItems;

  console.log(`Found ${items.length} items\n`);

  // Generate markdown guide
  let markdown = `# R365 UOM Conversion Guide\n`;
  markdown += `## ${org.name}\n`;
  markdown += `Generated: ${new Date().toISOString().split('T')[0]}\n\n`;

  markdown += `## Understanding R365 UOM Conversions\n\n`;
  markdown += `### The Three Measure Types\n`;
  markdown += `- **Weight**: lb, oz, kg, g\n`;
  markdown += `- **Volume**: L, mL, oz (fl oz), gal, qt, pt\n`;
  markdown += `- **Each**: ea, count, unit\n\n`;

  markdown += `### UOM Types in R365\n`;
  markdown += `1. **Purchase UOM** - How you order from vendors (e.g., "case")\n`;
  markdown += `2. **Inventory UOM** - How you track in inventory (e.g., "bottle")\n`;
  markdown += `3. **Recipe UOM** - How recipes call for it (e.g., "oz")\n`;
  markdown += `4. **Reporting UOM** - How you report usage (usually = inventory UOM)\n\n`;

  markdown += `### How to Read This Guide\n`;
  markdown += `For each item, you'll see:\n`;
  markdown += `- **Measure Type** - The R365 measure type (Weight/Volume/Each)\n`;
  markdown += `- **Base UOM** - Your recipe/reporting unit\n`;
  markdown += `- **Pack Configurations** - All the ways you can purchase this item\n`;
  markdown += `- **Conversion Factor** - How many base units in each pack\n\n`;

  markdown += `---\n\n`;

  // Group by category
  const byCategory: Record<string, ItemUOM[]> = {};

  for (const item of items) {
    const category = item.category || 'uncategorized';
    if (!byCategory[category]) byCategory[category] = [];

    byCategory[category].push({
      sku: item.sku,
      name: item.name,
      category: item.category,
      base_uom: item.base_uom,
      measure_type: item.r365_measure_type || 'Not Set',
      packs: (item as any).item_pack_configurations || []
    });
  }

  // Generate category sections
  for (const [category, categoryItems] of Object.entries(byCategory)) {
    markdown += `## ${category.toUpperCase()}\n\n`;

    for (const item of categoryItems) {
      markdown += `### ${item.name}\n`;
      markdown += `- **SKU**: ${item.sku}\n`;
      markdown += `- **Measure Type**: ${item.measure_type}\n`;
      markdown += `- **Recipe/Base UOM**: ${item.base_uom}\n\n`;

      if (item.packs.length === 0) {
        markdown += `⚠️ **No pack configurations** - Add pack configs to enable purchasing\n\n`;
      } else {
        markdown += `**Pack Configurations:**\n\n`;
        markdown += `| Purchase As | Units/Pack | Unit Size | Conversion to ${item.base_uom} | Vendor Code |\n`;
        markdown += `|-------------|------------|-----------|-----------------|-------------|\n`;

        for (const pack of item.packs) {
          const vendorCode = pack.vendor_item_code || '-';
          markdown += `| ${pack.pack_type} | ${pack.units_per_pack} | ${pack.unit_size}${pack.unit_size_uom} | ${pack.conversion_factor} ${item.base_uom} | ${vendorCode} |\n`;
        }
        markdown += `\n`;

        // Add example
        if (item.packs.length > 0) {
          const pack = item.packs[0];
          markdown += `**Example**: If you purchase 1 ${pack.pack_type}, you receive ${pack.conversion_factor} ${item.base_uom}\n\n`;
        }
      }

      markdown += `---\n\n`;
    }
  }

  // Generate summary statistics
  markdown += `## Summary Statistics\n\n`;
  markdown += `- **Total Items**: ${items.length}\n`;
  markdown += `- **Total Pack Configurations**: ${items.reduce((sum, item) => sum + ((item as any).item_pack_configurations?.length || 0), 0)}\n`;

  const itemsWithMultiplePacks = items.filter(item => ((item as any).item_pack_configurations?.length || 0) > 1);
  markdown += `- **Items with Multiple Purchase Options**: ${itemsWithMultiplePacks.length}\n\n`;

  const byMeasureType: Record<string, number> = {};
  for (const item of items) {
    const mt = item.r365_measure_type || 'Not Set';
    byMeasureType[mt] = (byMeasureType[mt] || 0) + 1;
  }

  markdown += `### Items by Measure Type\n`;
  for (const [mt, count] of Object.entries(byMeasureType)) {
    markdown += `- **${mt}**: ${count} items\n`;
  }
  markdown += `\n`;

  // Write to file
  const filename = 'R365_UOM_CONVERSION_GUIDE.md';
  fs.writeFileSync(filename, markdown);

  console.log(`✅ Guide generated: ${filename}`);
  console.log(`\n📄 This guide shows:`);
  console.log(`   - All ${items.length} items with their UOM configurations`);
  console.log(`   - Conversion factors for each pack size`);
  console.log(`   - How to purchase vs. how to track inventory\n`);

  // Generate CSV for R365 import
  generatePurchaseItemsCSV(items);
}

function generatePurchaseItemsCSV(items: any[]) {
  console.log('📊 Generating R365 Purchase Items CSV...\n');

  const rows: string[] = [];
  rows.push('SKU,Item Name,Vendor Code,Purchase UOM,Pack Size,Inventory UOM,Conversion Factor,Measure Type,Recipe UOM');

  for (const item of items) {
    const packs = (item as any).item_pack_configurations || [];

    if (packs.length === 0) {
      // No packs - use base UOM for everything
      rows.push(`${item.sku},"${item.name}",,"${item.base_uom}",1,"${item.base_uom}",1,${item.r365_measure_type || 'Each'},"${item.base_uom}"`);
    } else {
      // Create a row for each pack configuration
      for (const pack of packs) {
        const vendorCode = pack.vendor_item_code || '';
        const packSize = pack.units_per_pack > 1
          ? `${pack.units_per_pack}/${pack.unit_size}${pack.unit_size_uom}`
          : `${pack.unit_size}${pack.unit_size_uom}`;

        rows.push(`${item.sku},"${item.name}","${vendorCode}","${pack.pack_type}","${packSize}","${pack.unit_size_uom}",${pack.conversion_factor},${item.r365_measure_type || 'Each'},"${item.base_uom}"`);
      }
    }
  }

  const csv = rows.join('\n');
  const csvFilename = 'R365_PURCHASE_ITEMS.csv';
  fs.writeFileSync(csvFilename, csv);

  console.log(`✅ CSV generated: ${csvFilename}`);
  console.log(`   - Import this into R365 to configure purchase items\n`);
}

generateUOMGuide().catch(console.error);
