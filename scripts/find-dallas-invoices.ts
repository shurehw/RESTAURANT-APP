/**
 * Find Dallas Invoices in Database
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findDallasInvoices() {
  console.log('🔍 Finding Dallas Invoices\n');

  // Get Dallas venue
  const { data: dallas } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%dallas%')
    .single();

  console.log(`Dallas Venue: ${dallas?.name} (${dallas?.id})\n`);

  // List all tables in database
  const { data: allTables } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name');

  console.log('All Tables in Database:');
  const tableNames = allTables?.map(t => t.table_name) || [];

  // Group by category
  const invoiceTables = tableNames.filter(t =>
    t.includes('invoice') || t.includes('ap_') || t.includes('purchase')
  );

  const documentTables = tableNames.filter(t =>
    t.includes('document') || t.includes('upload') || t.includes('file')
  );

  console.log('\nInvoice/AP Related Tables:');
  if (invoiceTables.length > 0) {
    invoiceTables.forEach(t => console.log(`  - ${t}`));
  } else {
    console.log('  None found');
  }

  console.log('\nDocument/Upload Related Tables:');
  if (documentTables.length > 0) {
    documentTables.forEach(t => console.log(`  - ${t}`));
  } else {
    console.log('  None found');
  }

  console.log('\n');

  // Check ap_invoice_batches if it exists
  if (tableNames.includes('ap_invoice_batches')) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('AP INVOICE BATCHES');
    console.log('═══════════════════════════════════════════════════════\n');

    const { count: totalBatches } = await supabase
      .from('ap_invoice_batches')
      .select('*', { count: 'exact', head: true });

    console.log(`Total AP Invoice Batches: ${totalBatches || 0}`);

    const { count: dallasBatches } = await supabase
      .from('ap_invoice_batches')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', dallas!.id);

    console.log(`Dallas Batches: ${dallasBatches || 0}\n`);

    if (dallasBatches && dallasBatches > 0) {
      const { data: recentBatches } = await supabase
        .from('ap_invoice_batches')
        .select('*')
        .eq('venue_id', dallas!.id)
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('Recent Dallas Batches:');
      recentBatches?.forEach(batch => {
        const date = new Date(batch.created_at).toISOString().split('T')[0];
        console.log(`  ${date}: ${batch.file_name || 'N/A'} - ${batch.status || 'N/A'}`);
      });
      console.log();
    }
  }

  // Check ap_invoices if it exists
  if (tableNames.includes('ap_invoices')) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('AP INVOICES');
    console.log('═══════════════════════════════════════════════════════\n');

    const { count: totalInvoices } = await supabase
      .from('ap_invoices')
      .select('*', { count: 'exact', head: true });

    console.log(`Total AP Invoices: ${totalInvoices || 0}`);

    const { count: dallasInvoices } = await supabase
      .from('ap_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('venue_id', dallas!.id);

    console.log(`Dallas Invoices: ${dallasInvoices || 0}\n`);

    if (dallasInvoices && dallasInvoices > 0) {
      const { data: recentInvoices } = await supabase
        .from('ap_invoices')
        .select('*')
        .eq('venue_id', dallas!.id)
        .order('created_at', { ascending: false })
        .limit(10);

      console.log('Recent Dallas Invoices (last 10):');
      recentInvoices?.forEach(inv => {
        const date = new Date(inv.created_at).toISOString().split('T')[0];
        console.log(`  ${date}: ${inv.vendor_name || 'Unknown Vendor'} - $${inv.total_amount || 0} - ${inv.status || 'N/A'}`);
      });
      console.log();

      // Check for line items
      const { count: lineItems } = await supabase
        .from('ap_invoice_line_items')
        .select('*', { count: 'exact', head: true })
        .in('invoice_id', recentInvoices?.map(i => i.id) || []);

      console.log(`Line Items in Recent Invoices: ${lineItems || 0}\n`);

      if (lineItems && lineItems > 0) {
        const { data: sampleItems } = await supabase
          .from('ap_invoice_line_items')
          .select('*')
          .in('invoice_id', recentInvoices?.map(i => i.id) || [])
          .limit(20);

        console.log('Sample Line Items (first 20):');
        sampleItems?.forEach(item => {
          console.log(`  ${item.item_description || 'Unknown'}`);
          console.log(`    Qty: ${item.quantity || 0} | Price: $${item.unit_price || 0} | Total: $${item.total_amount || 0}`);
          console.log(`    Matched Item ID: ${item.item_id || 'Not matched'}\n`);
        });
      }
    }
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('Next Steps:');
  console.log('  1. Check line items for item matching');
  console.log('  2. Extract unique items from Dallas invoices');
  console.log('  3. Match to existing item catalog');
  console.log('  4. Create missing Dallas items\n');
}

findDallasInvoices().catch(console.error);
