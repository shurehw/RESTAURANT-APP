import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixMatch() {
  // Get the invoice line
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, lines:invoice_lines(*)')
    .eq('invoice_number', '16925255')
    .single();

  if (!invoice || !invoice.lines || invoice.lines.length === 0) {
    console.log('❌ Invoice or line not found');
    return;
  }

  const line = invoice.lines[0];
  console.log(`\n📋 Current mapping:`);
  console.log(`   Line: ${line.description}`);
  console.log(`   Currently mapped to: ${line.item_id}`);
  console.log(`   Confirmed: ${line.match_confirmed}`);

  // Update to correct item
  const correctItemId = 'd3b16864-d392-442f-b499-89572a542e42'; // Coke - Bev 8fl.oz

  const { error } = await supabase
    .from('invoice_lines')
    .update({
      item_id: correctItemId,
    })
    .eq('id', line.id);

  if (error) {
    console.error('❌ Error updating:', error);
    return;
  }

  console.log(`\n✅ Updated mapping:`);
  console.log(`   New item ID: ${correctItemId}`);
  console.log(`   Item name: Coke - Bev 8fl.oz`);
}

fixMatch();
