/**
 * Check Dallas Invoices Data
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDallasInvoicesData() {
  console.log('📄 Checking Dallas Invoices Data\n');

  // Get Dallas venue
  const { data: dallas } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%dallas%')
    .single();

  console.log(`Dallas Venue: ${dallas?.name}\n`);

  // Check total invoices
  const { count: totalInvoices } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  console.log(`Total Invoices (all venues): ${totalInvoices || 0}`);

  // Check Dallas invoices
  const { count: dallasInvoiceCount } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('venue_id', dallas!.id);

  console.log(`Dallas Invoices: ${dallasInvoiceCount || 0}\n`);

  if (dallasInvoiceCount && dallasInvoiceCount > 0) {
    // Get recent Dallas invoices
    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        invoice_date,
        total_amount,
        status,
        ocr_confidence,
        created_at,
        vendor:vendors(id, name)
      `)
      .eq('venue_id', dallas!.id)
      .order('created_at', { ascending: false })
      .limit(20);

    console.log('═══════════════════════════════════════════════════════');
    console.log('RECENT DALLAS INVOICES (Last 20)');
    console.log('═══════════════════════════════════════════════════════\n');

    recentInvoices?.forEach(inv => {
      const date = inv.invoice_date || inv.created_at?.split('T')[0];
      const vendor = (inv.vendor as any)?.name || 'Unknown Vendor';
      const confidence = inv.ocr_confidence ? ` (OCR: ${(inv.ocr_confidence * 100).toFixed(0)}%)` : '';

      console.log(`${date} | ${vendor}`);
      console.log(`  Invoice #: ${inv.invoice_number || 'N/A'} | $${inv.total_amount || 0} | ${inv.status}${confidence}\n`);
    });

    // Get invoice line items
    const invoiceIds = recentInvoices?.map(i => i.id) || [];
    const { count: lineCount } = await supabase
      .from('invoice_lines')
      .select('*', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds);

    console.log(`Total Line Items in Recent Invoices: ${lineCount || 0}\n`);

    if (lineCount && lineCount > 0) {
      // Get sample line items
      const { data: lineItems } = await supabase
        .from('invoice_lines')
        .select(`
          id,
          description,
          qty,
          unit_cost,
          line_total,
          item_id,
          ocr_confidence
        `)
        .in('invoice_id', invoiceIds)
        .limit(30);

      console.log('═══════════════════════════════════════════════════════');
      console.log('SAMPLE INVOICE LINE ITEMS (First 30)');
      console.log('═══════════════════════════════════════════════════════\n');

      const matched = lineItems?.filter(l => l.item_id) || [];
      const unmatched = lineItems?.filter(l => !l.item_id) || [];

      console.log(`Matched to Items: ${matched.length}`);
      console.log(`Unmatched: ${unmatched.length}\n`);

      console.log('Sample Unmatched Items (need item matching):');
      unmatched.slice(0, 15).forEach(item => {
        console.log(`  ${item.description}`);
        console.log(`    Qty: ${item.qty} @ $${item.unit_cost} = $${item.line_total}`);
      });
      console.log();

      // Get unique items from Dallas invoices
      const { data: allDallasLines } = await supabase
        .from('invoice_lines')
        .select('description, item_id')
        .in('invoice_id', invoiceIds);

      const uniqueDescriptions = new Set(allDallasLines?.map(l => l.description) || []);
      const unmatchedDescriptions = new Set(
        allDallasLines?.filter(l => !l.item_id).map(l => l.description) || []
      );

      console.log('═══════════════════════════════════════════════════════');
      console.log('ITEM MATCHING SUMMARY');
      console.log('═══════════════════════════════════════════════════════\n');

      console.log(`Unique Item Descriptions: ${uniqueDescriptions.size}`);
      console.log(`Unmatched Descriptions: ${unmatchedDescriptions.size}`);
      console.log(`Match Rate: ${((1 - unmatchedDescriptions.size / uniqueDescriptions.size) * 100).toFixed(1)}%\n`);

      console.log('Next Steps:');
      console.log('  1. Extract all unmatched items from Dallas invoices');
      console.log('  2. Normalize item names');
      console.log('  3. Match to existing 3,268 items in catalog');
      console.log('  4. Create new items for unmatched Dallas items');
      console.log('  5. Update invoice_lines with item_id mappings\n');
    }
  } else {
    console.log('❌ No Dallas invoices found in database\n');
    console.log('Check:');
    console.log('  - Were invoices uploaded with correct venue_id?');
    console.log('  - Check synced_emails table for processing errors');
    console.log('  - Verify email sync configuration for Dallas\n');
  }
}

checkDallasInvoicesData().catch(console.error);
