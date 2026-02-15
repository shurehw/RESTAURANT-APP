/**
 * Check Dallas OCR Invoice Data
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDallasOCR() {
  console.log('🔍 Checking Dallas OCR Invoice Data\n');

  // Find Dallas venue
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, city, state')
    .or('name.ilike.%dallas%,city.ilike.%dallas%');

  console.log('Dallas Venues:');
  if (venues && venues.length > 0) {
    venues.forEach(v => {
      console.log(`  ${v.name} - ${v.city}, ${v.state} (${v.id})`);
    });
  } else {
    console.log('  No Dallas venues found\n');
    // List all venues to see what we have
    const { data: allVenues } = await supabase
      .from('venues')
      .select('id, name, city, state')
      .limit(20);

    console.log('\nAll Venues (first 20):');
    allVenues?.forEach(v => {
      console.log(`  ${v.name} - ${v.city || 'N/A'}, ${v.state || 'N/A'}`);
    });
  }

  console.log('\n');

  // Check what invoice-related tables we have
  const { data: tables } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .or('table_name.ilike.%invoice%,table_name.ilike.%ocr%,table_name.ilike.%purchase%')
    .order('table_name');

  console.log('Invoice/OCR Related Tables:');
  if (tables && tables.length > 0) {
    tables.forEach(t => {
      console.log(`  - ${t.table_name}`);
    });
  } else {
    console.log('  No invoice/OCR tables found');
  }

  console.log('\n');

  // Check if we have invoices table and get sample data
  const { data: invoiceCount, error: invoiceError } = await supabase
    .from('invoices')
    .select('*', { count: 'exact', head: true });

  if (!invoiceError && invoiceCount !== null) {
    console.log(`Total Invoices: ${invoiceCount}`);

    // Get recent invoices
    const { data: recentInvoices } = await supabase
      .from('invoices')
      .select('id, vendor_id, venue_id, invoice_date, total, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    console.log('\nRecent Invoices (last 10):');
    recentInvoices?.forEach(inv => {
      const date = new Date(inv.created_at).toISOString().split('T')[0];
      console.log(`  ${date}: Venue ${inv.venue_id} | Vendor ${inv.vendor_id} | $${inv.total || 0} | ${inv.status || 'N/A'}`);
    });

    // Check if invoices have line items
    const { data: lineItemCount } = await supabase
      .from('invoice_line_items')
      .select('*', { count: 'exact', head: true });

    console.log(`\nTotal Invoice Line Items: ${lineItemCount || 0}`);

    if (lineItemCount && lineItemCount > 0) {
      // Get sample line items
      const { data: sampleItems } = await supabase
        .from('invoice_line_items')
        .select('id, invoice_id, item_name, quantity, unit_price, item_id')
        .limit(20);

      console.log('\nSample Line Items (first 20):');
      sampleItems?.forEach(item => {
        console.log(`  ${item.item_name || 'Unknown'} | Qty: ${item.quantity || 0} | Price: $${item.unit_price || 0} | Item ID: ${item.item_id || 'Not linked'}`);
      });
    }
  } else {
    console.log('No invoices table found or accessible\n');
  }
}

checkDallasOCR().catch(console.error);
