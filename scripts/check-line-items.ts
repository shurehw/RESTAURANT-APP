import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkLineItems() {
  const supabase = createAdminClient();

  // Count total line items
  const { count: totalCount } = await supabase
    .from('invoice_line_items')
    .select('*', { count: 'exact', head: true });

  console.log(`\nTotal line items in database: ${totalCount}\n`);

  // Get line items by venue (through invoices)
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('id, invoice_id, invoices(venue_id, venues(name))');

  console.log(`Sample line items (first 5):`);
  lineItems?.slice(0, 5).forEach(item => {
    const inv = item.invoices as any;
    const venueName = inv?.venues?.name || 'Unknown';
    console.log(`  Line item ${item.id} -> Invoice ${item.invoice_id} -> Venue: ${venueName}`);
  });
}

checkLineItems()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
