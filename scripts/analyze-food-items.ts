import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FoodItem {
  description: string;
  vendor: string;
  qty: number;
  unit_cost: number;
  frequency: number;
}

async function analyzeFoodItems() {
  console.log('🍽️  ANALYZING FOOD LINE ITEMS FOR TRAINING');
  console.log('═'.repeat(70));

  // Get all food vendors (non-beverage)
  const foodVendors = [
    "Chef's Produce", "Chefs' Produce", "Chefs Warehouse", "Mr. Greens",
    "SEAFOOD SUPPLY COMPANY", "Allen Brothers Texas", "Dairyland Produce",
    "SYSCO", "Sysco North Texas", "MARKON", "MARION", "RARE FOODS",
    "Minamoto Wholesale", "Zab's Inc", "Empire Baking"
  ];

  // Get food line items from recent imports
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select(`
      description,
      qty,
      unit_cost,
      invoices!inner(
        vendor_id,
        vendors(name)
      )
    `)
    .gte('invoices.created_at', '2026-01-24');

  if (!lines) {
    console.log('No line items found');
    return;
  }

  console.log(`Total line items: ${lines.length}\n`);

  // Group by vendor
  const byVendor = new Map<string, typeof lines>();
  const itemFrequency = new Map<string, number>();

  lines.forEach(line => {
    const vendor = (line.invoices as any)?.vendors?.name || 'Unknown';

    if (!byVendor.has(vendor)) {
      byVendor.set(vendor, []);
    }
    byVendor.get(vendor)!.push(line);

    // Track frequency
    const key = `${line.description}|${vendor}`;
    itemFrequency.set(key, (itemFrequency.get(key) || 0) + 1);
  });

  console.log('📊 VENDOR BREAKDOWN:');
  console.log('─'.repeat(70));

  const vendorStats = Array.from(byVendor.entries())
    .map(([vendor, items]) => ({
      vendor,
      count: items.length,
      totalValue: items.reduce((sum, i) => sum + (i.qty * i.unit_cost), 0)
    }))
    .sort((a, b) => b.count - a.count);

  vendorStats.forEach((stat, i) => {
    console.log(`${i + 1}. ${stat.vendor}: ${stat.count} items ($${stat.totalValue.toFixed(2)})`);
  });

  // Categorize items by keywords
  console.log('\n\n🔍 CATEGORIZATION ANALYSIS:');
  console.log('─'.repeat(70));

  const categories = {
    'Meat & Protein': ['beef', 'pork', 'chicken', 'lamb', 'steak', 'chop', 'ribs', 'brisket', 'bacon', 'sausage'],
    'Seafood': ['salmon', 'tuna', 'shrimp', 'lobster', 'crab', 'fish', 'scallop', 'oyster', 'seafood'],
    'Produce': ['lettuce', 'tomato', 'onion', 'pepper', 'mushroom', 'herbs', 'greens', 'cucumber', 'carrot', 'celery', 'cabbage', 'brussels', 'asparagus', 'avocado', 'apple', 'lemon', 'lime', 'orange', 'grapefruit'],
    'Dairy & Eggs': ['milk', 'cream', 'cheese', 'butter', 'eggs', 'yogurt'],
    'Dry Goods & Pantry': ['flour', 'sugar', 'rice', 'pasta', 'grits', 'oil', 'vinegar', 'salt', 'pepper', 'spice'],
    'Bakery': ['bread', 'bun', 'roll', 'pastry', 'croissant'],
    'Specialty & Gourmet': ['truffle', 'caviar', 'foie', 'wagyu', 'kobe', 'pate'],
    'Beverages (Non-Alc)': ['juice', 'soda', 'water', 'tea', 'coffee']
  };

  const categorized = new Map<string, typeof lines>();
  const uncategorized: typeof lines = [];

  lines.forEach(line => {
    const desc = line.description.toLowerCase();
    let matched = false;

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => desc.includes(kw))) {
        if (!categorized.has(category)) {
          categorized.set(category, []);
        }
        categorized.get(category)!.push(line);
        matched = true;
        break;
      }
    }

    if (!matched) {
      uncategorized.push(line);
    }
  });

  console.log('\nBy Category:');
  Array.from(categorized.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([category, items]) => {
      console.log(`  ${category}: ${items.length} items`);
    });

  console.log(`  Uncategorized: ${uncategorized.length} items`);

  // Sample items from each category
  console.log('\n\n📋 SAMPLE ITEMS BY CATEGORY:');
  console.log('─'.repeat(70));

  for (const [category, items] of categorized.entries()) {
    console.log(`\n${category} (${items.length} items):`);
    const samples = items
      .slice(0, 5)
      .map(i => i.description);
    samples.forEach((desc, i) => {
      console.log(`  ${i + 1}. ${desc}`);
    });
  }

  // Analyze pack configurations
  console.log('\n\n📦 PACK CONFIGURATION PATTERNS:');
  console.log('─'.repeat(70));

  const packPatterns = {
    'Case (CS)': /\bcs\b|\bcase\b/i,
    'Pound (LB/#)': /\blb\b|\b#\b/i,
    'Each (EA)': /\bea\b|\beach\b/i,
    'Ounce (OZ)': /\boz\b/i,
    'Piece (PC)': /\bpc\b|\bpiece\b/i,
    'Box': /\bbox\b/i,
    'Bag': /\bbag\b/i,
    'Dozen': /\bdozen\b|\bdz\b/i,
    'Gallon (GAL)': /\bgal\b|\bgallon\b/i
  };

  const packCounts = new Map<string, number>();

  lines.forEach(line => {
    for (const [packType, pattern] of Object.entries(packPatterns)) {
      if (pattern.test(line.description)) {
        packCounts.set(packType, (packCounts.get(packType) || 0) + 1);
        break;
      }
    }
  });

  console.log('\nPack types found:');
  Array.from(packCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([packType, count]) => {
      console.log(`  ${packType}: ${count} items (${((count / lines.length) * 100).toFixed(1)}%)`);
    });

  // Most frequent items
  console.log('\n\n🔄 MOST FREQUENT ITEMS (likely staples):');
  console.log('─'.repeat(70));

  const frequent = Array.from(itemFrequency.entries())
    .map(([key, freq]) => {
      const [desc, vendor] = key.split('|');
      return { description: desc, vendor, frequency: freq };
    })
    .filter(i => i.frequency > 1)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);

  frequent.forEach((item, i) => {
    console.log(`${i + 1}. ${item.description} (${item.vendor}) - ${item.frequency}x`);
  });

  // Export detailed analysis to CSV
  const csvData = lines.map(line => {
    const vendor = (line.invoices as any)?.vendors?.name || 'Unknown';
    const desc = line.description;

    // Categorize
    let category = 'Uncategorized';
    for (const [cat, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => desc.toLowerCase().includes(kw))) {
        category = cat;
        break;
      }
    }

    // Pack type
    let packType = 'Unknown';
    for (const [pack, pattern] of Object.entries(packPatterns)) {
      if (pattern.test(desc)) {
        packType = pack;
        break;
      }
    }

    return {
      description: desc,
      vendor,
      category,
      packType,
      qty: line.qty,
      unitCost: line.unit_cost
    };
  });

  const csv = [
    'Description,Vendor,Category,PackType,Qty,UnitCost',
    ...csvData.map(row =>
      `"${row.description}","${row.vendor}","${row.category}","${row.packType}",${row.qty},${row.unitCost}`
    )
  ].join('\n');

  await writeFile('food-items-analysis.csv', csv);
  console.log('\n\n💾 Exported detailed analysis to food-items-analysis.csv');

  // Summary recommendations
  console.log('\n\n💡 TRAINING RECOMMENDATIONS:');
  console.log('═'.repeat(70));
  console.log('1. Add food subcategories: Meat, Seafood, Produce, Dairy, Dry Goods, Bakery');
  console.log('2. Add pack types: Case, Pound, Each, Piece, Box, Bag, Dozen, Gallon');
  console.log('3. Create GL mappings:');
  console.log('   - 5300: Meat & Protein Cost');
  console.log('   - 5301: Seafood Cost');
  console.log('   - 5302: Produce Cost');
  console.log('   - 5303: Dairy Cost');
  console.log('   - 5304: Dry Goods Cost');
  console.log('   - 5305: Bakery Cost');
  console.log('4. Train auto-mapping with keyword patterns for each category');
  console.log('5. Update OCR to detect pack configs like "12 PC/CS", "1 LB", "EA"');
}

analyzeFoodItems();
