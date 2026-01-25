import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteImpossiblePrices() {
  console.log('🗑️  Deleting lines with impossible prices...\n');

  // Delete lines with unit_cost > $10,000 OR line_total > $50,000
  const { data: toDelete, error: fetchError } = await supabase
    .from('invoice_lines')
    .select('id, description, unit_cost, line_total, invoices!inner(vendors(name))')
    .or('unit_cost.gt.10000,line_total.gt.50000');

  if (fetchError) {
    console.error('Error fetching lines:', fetchError);
    return;
  }

  console.log(`Found ${toDelete?.length || 0} lines with impossible prices:\n`);

  toDelete?.forEach((line: any) => {
    console.log(`  - ${line.description}`);
    console.log(`    $${line.unit_cost} × qty = $${line.line_total}`);
    console.log(`    Vendor: ${line.invoices?.vendors?.name || 'Unknown'}\n`);
  });

  if (!toDelete || toDelete.length === 0) {
    console.log('✅ No impossible prices found!');
    return;
  }

  const totalValue = toDelete.reduce((sum: number, l: any) => sum + (l.line_total || 0), 0);
  console.log(`Total bad value: $${totalValue.toFixed(2)}\n`);

  // Delete them
  const { error: deleteError } = await supabase
    .from('invoice_lines')
    .delete()
    .or('unit_cost.gt.10000,line_total.gt.50000');

  if (deleteError) {
    console.error('❌ Error deleting:', deleteError);
  } else {
    console.log(`✅ Deleted ${toDelete.length} lines with impossible prices`);
    console.log(`💰 Removed $${totalValue.toFixed(2)} in bad data`);
  }
}

deleteImpossiblePrices();
