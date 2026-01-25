import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyzeEmptyInvoices() {
  console.log('🔍 Analyzing Invoices with Missing Line Items\n');
  console.log('═'.repeat(70));

  // Get all invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_name, total_amount, status, created_at, pdf_url, ocr_status')
    .order('created_at', { ascending: false });

  if (!invoices) {
    console.log('❌ No invoices found');
    return;
  }

  // Get all invoice lines
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, id');

  const invoiceIdsWithLines = new Set(lines?.map(l => l.invoice_id));
  const emptyInvoices = invoices.filter(i => !invoiceIdsWithLines.has(i.id));

  console.log(`\n📊 SUMMARY:\n`);
  console.log(`Total Invoices: ${invoices.length}`);
  console.log(`Invoices WITH line items: ${invoiceIdsWithLines.size}`);
  console.log(`Invoices WITHOUT line items: ${emptyInvoices.length}`);

  const emptyValue = emptyInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
  console.log(`Total value of empty invoices: $${emptyValue.toFixed(2)}\n`);

  // Breakdown by status
  console.log('📋 EMPTY INVOICES BY STATUS:\n');
  const byStatus = emptyInvoices.reduce((acc: any, inv) => {
    const status = inv.status || 'null';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byStatus)
    .sort(([, a]: any, [, b]: any) => b - a)
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

  // OCR status breakdown
  console.log('\n🤖 EMPTY INVOICES BY OCR STATUS:\n');
  const byOcrStatus = emptyInvoices.reduce((acc: any, inv) => {
    const status = inv.ocr_status || 'null';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byOcrStatus)
    .sort(([, a]: any, [, b]: any) => b - a)
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

  // PDF presence
  console.log('\n📄 PDF URL PRESENCE:\n');
  const withPdf = emptyInvoices.filter(i => i.pdf_url).length;
  const withoutPdf = emptyInvoices.length - withPdf;
  console.log(`  With PDF: ${withPdf}`);
  console.log(`  Without PDF: ${withoutPdf}`);

  // Recent vs old
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentEmpty = emptyInvoices.filter(i => new Date(i.created_at) > thirtyDaysAgo).length;
  const oldEmpty = emptyInvoices.length - recentEmpty;

  console.log('\n📅 AGE OF EMPTY INVOICES:\n');
  console.log(`  Created in last 30 days: ${recentEmpty}`);
  console.log(`  Older than 30 days: ${oldEmpty}`);

  // Sample recent empty invoices
  console.log('\n\n🔍 RECENT EMPTY INVOICES (Last 15):\n');
  console.log('─'.repeat(70));

  emptyInvoices.slice(0, 15).forEach((inv, idx) => {
    console.log(`\n${idx + 1}. Invoice #${inv.invoice_number}`);
    console.log(`   Vendor: ${inv.vendor_name || 'Unknown'}`);
    console.log(`   Total: $${inv.total_amount}`);
    console.log(`   Status: ${inv.status || 'none'}`);
    console.log(`   OCR Status: ${inv.ocr_status || 'none'}`);
    console.log(`   PDF: ${inv.pdf_url ? '✓' : '✗'}`);
    console.log(`   Created: ${new Date(inv.created_at).toLocaleDateString()}`);
  });

  console.log('\n' + '═'.repeat(70));
}

analyzeEmptyInvoices();
