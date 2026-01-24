import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyze() {
  // Get recent invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n📋 RECENT INVOICES:', invoices?.length || 0);

  if (!invoices?.length) return;

  // Get invoice lines with mapping info
  for (const inv of invoices.slice(0, 3)) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('description, qty, unit_cost, item_id, matched_at')
      .eq('invoice_id', inv.id)
      .order('line_number');

    const matched = lines?.filter(l => l.item_id) || [];
    const unmatched = lines?.filter(l => !l.item_id) || [];

    console.log(`\n━━━ ${inv.invoice_number} ━━━`);
    console.log(`Total lines: ${lines?.length || 0} | Matched: ${matched.length} | Unmatched: ${unmatched.length}`);

    if (unmatched.length > 0) {
      console.log('\n❌ UNMATCHED LINES:');
      unmatched.slice(0, 5).forEach(line => {
        console.log(`  • ${line.description} (qty: ${line.qty}, cost: $${line.unit_cost})`);
      });
    }

    if (matched.length > 0) {
      console.log('\n✅ MATCHED LINES:');
      matched.slice(0, 3).forEach(line => {
        console.log(`  • ${line.description}`);
      });
    }
  }

  // Get recently created items
  const { data: recentItems } = await supabase
    .from('items')
    .select('name, sku, category, subcategory, base_uom, created_at, gl_account_id')
    .order('created_at', { ascending: false })
    .limit(15);

  console.log('\n\n📦 RECENTLY CREATED ITEMS:', recentItems?.length || 0);
  recentItems?.forEach(item => {
    const hasGL = item.gl_account_id ? '✅' : '❌';
    console.log(`${hasGL} ${item.name} | ${item.category || 'no-cat'} | ${item.base_uom || 'no-uom'} | GL: ${item.gl_account_id ? 'YES' : 'NO'}`);
  });
}

analyze();
