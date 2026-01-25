import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkUnmapped() {
  console.log('📋 Checking unmapped invoice lines...\n');

  // Count total lines
  const { count: totalLines } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true });

  // Count mapped lines
  const { count: mappedLines } = await supabase
    .from('invoice_lines')
    .select('*', { count: 'exact', head: true })
    .not('item_id', 'is', null);

  const unmappedCount = (totalLines || 0) - (mappedLines || 0);
  const mappedPercent = totalLines ? ((mappedLines || 0) / totalLines * 100).toFixed(1) : 0;

  console.log('Total invoice lines:', totalLines);
  console.log('Mapped lines:', mappedLines, '(' + mappedPercent + '%)');
  console.log('Unmapped lines:', unmappedCount);

  // Get sample unmapped items by vendor
  const { data: unmapped } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      line_total,
      invoices!inner(
        invoice_number,
        vendors(name)
      )
    `)
    .is('item_id', null)
    .order('line_total', { ascending: false })
    .limit(50);

  if (unmapped && unmapped.length > 0) {
    console.log('\n📊 Top unmapped items by value:\n');

    const byVendor: Record<string, any[]> = {};
    unmapped.forEach((line: any) => {
      const vendor = line.invoices.vendors?.name || 'Unknown';
      if (!byVendor[vendor]) byVendor[vendor] = [];
      byVendor[vendor].push(line);
    });

    Object.entries(byVendor).forEach(([vendor, lines]) => {
      console.log(`\n${vendor} (${lines.length} items):`);
      lines.slice(0, 10).forEach((line: any) => {
        console.log(`  - ${line.description}`);
        console.log(`    Qty: ${line.qty} @ $${line.unit_cost} = $${line.line_total}`);
      });
      if (lines.length > 10) {
        console.log(`  ... and ${lines.length - 10} more`);
      }
    });

    // Total value unmapped
    const unmappedValue = unmapped.reduce((sum: number, line: any) => sum + (line.line_total || 0), 0);
    console.log(`\n💰 Value of top 50 unmapped items: $${unmappedValue.toFixed(2)}`);

    // Total unmapped value (all items)
    const { data: allUnmapped } = await supabase
      .from('invoice_lines')
      .select('line_total')
      .is('item_id', null);

    const totalUnmappedValue = allUnmapped?.reduce((sum: number, line: any) => sum + (line.line_total || 0), 0) || 0;
    console.log(`💰 Total unmapped value (all ${unmappedCount} items): $${totalUnmappedValue.toFixed(2)}`);
  } else {
    console.log('\n✅ All items are mapped!');
  }
}

checkUnmapped();
