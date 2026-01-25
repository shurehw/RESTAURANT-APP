import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyCleanup() {
  console.log('🔍 Verifying cleanup results...\n');

  // Count total lines
  const { count: totalCount } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true });

  console.log('Total invoice lines after cleanup:', totalCount);

  // Sample legitimate items to make sure they weren't deleted
  const { data: legitItems } = await supabase
    .from('invoice_lines')
    .select('description, qty, unit_cost, line_total')
    .gt('unit_cost', 5)
    .gt('line_total', 10)
    .limit(10);

  console.log('\n✅ Sample legitimate items (cost > $5):');
  legitItems?.forEach((item: any) => {
    console.log(`  - ${item.description}`);
    console.log(`    Qty: ${item.qty} @ $${item.unit_cost} = $${item.line_total}`);
  });

  // Check for any remaining junk (should be very few)
  const { count: zeroCount } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true })
    .eq('unit_cost', 0)
    .eq('line_total', 0);

  console.log(`\n📊 Zero-cost lines remaining: ${zeroCount || 0}`);
  if (zeroCount && zeroCount > 0) {
    console.log('   (These might be legitimate credit lines or delivery fees)');
  }
}

verifyCleanup();
