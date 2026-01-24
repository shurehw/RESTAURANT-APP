import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('📋 Review All Invoice Line Mappings\n');

  // Get all invoice lines with their mappings
  const { data: lines, error } = await supabase
    .from('invoice_lines')
    .select(`
      id,
      description,
      qty,
      unit_cost,
      line_total,
      item:items(id, name, sku, category),
      invoice:invoices(
        invoice_number,
        invoice_date,
        vendor:vendors(name)
      )
    `)
    .not('item_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!lines || lines.length === 0) {
    console.log('No mapped lines found');
    return;
  }

  console.log(`Found ${lines.length} mapped invoice lines\n`);
  console.log('=' .repeat(120));

  // Group by vendor for easier review
  const byVendor = lines.reduce((acc, line: any) => {
    const vendor = line.invoice?.vendor?.name || 'Unknown';
    if (!acc[vendor]) {
      acc[vendor] = [];
    }
    acc[vendor].push(line);
    return acc;
  }, {} as Record<string, any[]>);

  for (const [vendor, vendorLines] of Object.entries(byVendor)) {
    console.log(`\n📦 ${vendor} (${vendorLines.length} mapped lines)`);
    console.log('-'.repeat(120));

    vendorLines.forEach((line: any, idx) => {
      const invoiceDesc = line.description;
      const mappedItem = line.item?.name || 'N/A';
      const match = invoiceDesc.toLowerCase().includes(mappedItem.toLowerCase().substring(0, 10)) ? '✓' : '⚠️ ';

      console.log(`${match} Invoice: "${invoiceDesc}"`);
      console.log(`   Mapped to: "${mappedItem}" (SKU: ${line.item?.sku || 'N/A'})`);
      console.log(`   Qty: ${line.qty} × $${line.unit_cost} = $${line.line_total}`);

      if (idx < vendorLines.length - 1) {
        console.log('');
      }
    });
  }

  console.log('\n' + '='.repeat(120));
  console.log(`\n📊 Summary:`);
  console.log(`  Total mapped lines: ${lines.length}`);
  console.log(`  Vendors: ${Object.keys(byVendor).length}`);

  // Count potential mismatches
  const suspicious = lines.filter((line: any) => {
    const desc = line.description.toLowerCase();
    const itemName = line.item?.name?.toLowerCase() || '';
    const firstWords = itemName.substring(0, Math.min(10, itemName.length));
    return !desc.includes(firstWords);
  });

  console.log(`  ⚠️  Potentially incorrect mappings: ${suspicious.length}`);
  console.log('\nTo unmap all and remap:');
  console.log('  node_modules/.bin/tsx scripts/bulk-unmap-invoices.ts');
}

main().catch(console.error);
