import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkInvoice() {
  // Get the most recent invoice
  const { data: invoice, error: invError } = await supabase
    .from('invoices')
    .select('*, vendor:vendors(name)')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (invError) {
    console.error('Error fetching invoice:', invError);
    return;
  }

  console.log('\n=== LATEST INVOICE ===');
  console.log('Invoice ID:', invoice.id);
  console.log('Vendor:', invoice.vendor?.name);
  console.log('Invoice #:', invoice.invoice_number);
  console.log('Date:', invoice.invoice_date);
  console.log('Total:', invoice.total_amount);

  // Get invoice lines
  const { data: lines, error: linesError } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoice.id)
    .order('created_at', { ascending: true });

  if (linesError) {
    console.error('Error fetching lines:', linesError);
    return;
  }

  console.log('\n=== INVOICE LINES ===');
  console.log('Total lines:', lines?.length || 0);

  lines?.forEach((line, i) => {
    console.log(`\n[Line ${i + 1}] ${line.description}`);
    console.log('    Qty:', line.qty);
    console.log('    Unit Cost:', line.unit_cost);
    console.log('    Line Total:', line.line_total);
    console.log('    Item ID:', line.item_id || 'UNMAPPED');
  });

  // Check OCR raw JSON
  console.log('\n=== OCR RAW DATA ===');
  const rawInvoice = invoice.ocr_raw_json;
  if (rawInvoice && rawInvoice.lineItems) {
    console.log('Line items in OCR JSON:', rawInvoice.lineItems.length);
    rawInvoice.lineItems.forEach((item: any, i: number) => {
      console.log(`\n[OCR Item ${i + 1}] ${item.description}`);
      console.log('    Qty:', item.qty);
      console.log('    Unit Price:', item.unitPrice);
      console.log('    Line Total:', item.lineTotal);
    });
  }
}

checkInvoice();
