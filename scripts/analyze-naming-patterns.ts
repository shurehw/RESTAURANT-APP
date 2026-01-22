import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeNaming() {
  const { data: items } = await supabase
    .from('items')
    .select('name, sku')
    .eq('is_active', true)
    .order('name');

  console.log('\n=== Product Name Patterns ===\n');

  // Categorize naming patterns
  const patterns = {
    withUnit: [] as string[],
    withoutUnit: [] as string[],
    mixed: [] as string[]
  };

  for (const item of items || []) {
    const name = item.name;

    // Check if name ends with a unit pattern
    const hasUnit = /\d+(\.\d+)?(ml|oz|l|gal|lb|kg|g|fl\.oz|each|in)$/i.test(name);

    if (hasUnit) {
      patterns.withUnit.push(name);
    } else {
      patterns.withoutUnit.push(name);
    }
  }

  console.log(`Items WITH unit in name: ${patterns.withUnit.length}`);
  console.log('Sample:');
  patterns.withUnit.slice(0, 15).forEach(n => console.log(`  ${n}`));

  console.log(`\nItems WITHOUT unit in name: ${patterns.withoutUnit.length}`);
  console.log('Sample:');
  patterns.withoutUnit.slice(0, 15).forEach(n => console.log(`  ${n}`));

  // Analyze units used
  console.log('\n=== Units Found in Names ===\n');
  const unitCounts = new Map<string, number>();

  for (const name of patterns.withUnit) {
    const match = name.match(/(\d+(\.\d+)?)(ml|oz|l|gal|lb|kg|g|fl\.oz|each|in)$/i);
    if (match) {
      const unit = match[3].toLowerCase();
      unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
    }
  }

  Array.from(unitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([unit, count]) => {
      console.log(`  ${unit.padEnd(10)} ${count} items`);
    });
}

analyzeNaming().catch(console.error);
