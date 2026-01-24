import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('🔄 Bulk Unmap Invoice Lines\n');
  console.log('This will remove all item mappings from invoice lines,');
  console.log('allowing you to remap them with better matching.\n');

  // Get all invoice lines that are currently mapped
  const { data: mappedLines, error: fetchError } = await supabase
    .from('invoice_lines')
    .select('id, description, invoice:invoices(invoice_number, vendor:vendors(name))')
    .not('item_id', 'is', null);

  if (fetchError) {
    console.error('Error fetching mapped lines:', fetchError);
    return;
  }

  if (!mappedLines || mappedLines.length === 0) {
    console.log('✅ No mapped lines found - nothing to unmap!');
    return;
  }

  console.log(`📊 Found ${mappedLines.length} mapped invoice lines\n`);

  // Group by invoice for summary
  const byInvoice = mappedLines.reduce((acc, line: any) => {
    const invNum = line.invoice?.invoice_number || 'Unknown';
    if (!acc[invNum]) {
      acc[invNum] = {
        vendor: line.invoice?.vendor?.name || 'Unknown',
        count: 0,
      };
    }
    acc[invNum].count++;
    return acc;
  }, {} as Record<string, { vendor: string; count: number }>);

  console.log('Mapped lines by invoice:');
  Object.entries(byInvoice).forEach(([invNum, info]) => {
    console.log(`  Invoice #${invNum} (${info.vendor}): ${info.count} lines`);
  });

  console.log('\n🗑️  Unmapping all invoice lines...\n');

  // Unmap all lines in batches
  const batchSize = 100;
  let unmapped = 0;

  for (let i = 0; i < mappedLines.length; i += batchSize) {
    const batch = mappedLines.slice(i, i + batchSize);
    const ids = batch.map(l => l.id);

    const { error } = await supabase
      .from('invoice_lines')
      .update({ item_id: null })
      .in('id', ids);

    if (error) {
      console.error(`❌ Error unmapping batch ${i / batchSize + 1}:`, error);
    } else {
      unmapped += ids.length;
      console.log(`  Unmapped ${unmapped}/${mappedLines.length} lines...`);
    }
  }

  console.log(`\n✅ Successfully unmapped ${unmapped} invoice lines!`);
  console.log('\nYou can now remap them using:');
  console.log('  - The invoice review page (/invoices/[id]/review)');
  console.log('  - Bulk item mapping (/invoices/bulk-review)');
  console.log('  - Auto-match with improved matching logic\n');
}

main().catch(console.error);
