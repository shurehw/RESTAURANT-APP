/**
 * Investigate the 91 invoices with no OCR data
 * Find out when they were created, by whom, and their source
 */

import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function investigateNoOcrInvoices() {
  const supabase = createAdminClient();

  console.log('\n🔍 INVESTIGATING INVOICES WITHOUT OCR DATA\n');
  console.log('═'.repeat(80));

  // Get all invoices without OCR data
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      status,
      created_at,
      created_by,
      storage_path,
      ocr_raw_json,
      ocr_confidence,
      is_preopening,
      vendors!inner(name)
    `)
    .order('created_at', { ascending: false });

  if (!invoices) {
    console.log('No invoices found');
    return;
  }

  // Get invoice lines to filter out invoices with lines
  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id');

  const invoiceIdsWithLines = new Set(lines?.map(l => l.invoice_id));

  // Filter to invoices without OCR data and without lines
  const noOcrInvoices = invoices.filter(inv => {
    const hasLines = invoiceIdsWithLines.has(inv.id);
    const hasOcrData = inv.ocr_raw_json && Object.keys(inv.ocr_raw_json).length > 0;
    const hasAmount = inv.total_amount && inv.total_amount > 0;

    return !hasLines && !hasOcrData && hasAmount;
  });

  console.log(`Found ${noOcrInvoices.length} invoices without OCR data or line items\n`);

  if (noOcrInvoices.length === 0) {
    console.log('✅ No invoices found');
    return;
  }

  // Analyze by creation date
  const byMonth = noOcrInvoices.reduce((acc: any, inv) => {
    const date = new Date(inv.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(inv);
    return acc;
  }, {});

  console.log('📅 CREATION DATE DISTRIBUTION:\n');
  Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .forEach(([month, invs]: [string, any]) => {
      const total = invs.reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0);
      console.log(`  ${month}: ${invs.length} invoices ($${total.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    });

  // Analyze by vendor
  console.log('\n📦 TOP VENDORS:\n');
  const byVendor = noOcrInvoices.reduce((acc: any, inv) => {
    const vendor = (inv.vendors as any)?.name || 'Unknown';
    if (!acc[vendor]) {
      acc[vendor] = { count: 0, total: 0 };
    }
    acc[vendor].count++;
    acc[vendor].total += inv.total_amount || 0;
    return acc;
  }, {});

  Object.entries(byVendor)
    .sort(([, a]: any, [, b]: any) => b.count - a.count)
    .slice(0, 15)
    .forEach(([vendor, stats]: [string, any]) => {
      console.log(`  ${vendor}: ${stats.count} invoices ($${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    });

  // Check if they have PDFs
  console.log('\n📄 PDF/STORAGE STATUS:\n');
  const withPdf = noOcrInvoices.filter(i => i.storage_path).length;
  const withoutPdf = noOcrInvoices.length - withPdf;
  console.log(`  With storage_path: ${withPdf}`);
  console.log(`  Without storage_path: ${withoutPdf}`);

  // Check status distribution
  console.log('\n📊 STATUS DISTRIBUTION:\n');
  const byStatus = noOcrInvoices.reduce((acc: any, inv) => {
    const status = inv.status || 'null';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  Object.entries(byStatus)
    .sort(([, a]: any, [, b]: any) => b - a)
    .forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

  // Check if preopening
  console.log('\n🏗️  PRE-OPENING STATUS:\n');
  const preopening = noOcrInvoices.filter(i => i.is_preopening).length;
  const notPreopening = noOcrInvoices.length - preopening;
  console.log(`  Pre-opening: ${preopening}`);
  console.log(`  Not pre-opening: ${notPreopening}`);

  // Show sample invoices from different time periods
  console.log('\n\n📋 SAMPLE INVOICES (oldest to newest):\n');
  console.log('─'.repeat(80));

  const samples = [
    ...noOcrInvoices.slice(-5).reverse(), // 5 oldest
    ...noOcrInvoices.slice(0, 5), // 5 newest
  ].filter((inv, idx, arr) => arr.findIndex(i => i.id === inv.id) === idx); // dedupe

  samples.forEach((inv, idx) => {
    console.log(`\n${idx + 1}. Invoice #${inv.invoice_number || 'NO NUMBER'}`);
    console.log(`   Vendor: ${(inv.vendors as any)?.name || 'Unknown'}`);
    console.log(`   Invoice Date: ${inv.invoice_date}`);
    console.log(`   Total: $${inv.total_amount?.toFixed(2) || '0.00'}`);
    console.log(`   Status: ${inv.status || 'none'}`);
    console.log(`   Created: ${new Date(inv.created_at).toLocaleString()}`);
    console.log(`   Created By: ${inv.created_by || 'null'}`);
    console.log(`   Has PDF: ${inv.storage_path ? '✓' : '✗'}`);
    console.log(`   Pre-opening: ${inv.is_preopening ? 'Yes' : 'No'}`);
  });

  // Calculate total value
  const totalValue = noOcrInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

  console.log('\n' + '═'.repeat(80));
  console.log('\n💰 FINANCIAL SUMMARY:\n');
  console.log(`Total invoices without OCR: ${noOcrInvoices.length}`);
  console.log(`Total value: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Average invoice: $${(totalValue / noOcrInvoices.length).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

  console.log('\n═'.repeat(80));
}

investigateNoOcrInvoices()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
