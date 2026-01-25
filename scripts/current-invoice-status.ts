/**
 * Show current status of all invoices in the system
 */

import { createAdminClient } from '@/lib/supabase/server';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function getCurrentStatus() {
  const supabase = createAdminClient();

  console.log('\n📊 CURRENT INVOICE STATUS\n');
  console.log('═'.repeat(80));

  // Get all invoices with line counts
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      status,
      created_at,
      ocr_confidence,
      vendors!inner(name),
      venues!inner(name)
    `)
    .order('invoice_date', { ascending: false });

  const { data: lines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, line_total');

  const linesByInvoice = new Map<string, { count: number; total: number }>();
  lines?.forEach(line => {
    const existing = linesByInvoice.get(line.invoice_id) || { count: 0, total: 0 };
    existing.count++;
    existing.total += line.line_total || 0;
    linesByInvoice.set(line.invoice_id, existing);
  });

  console.log(`\n📈 OVERVIEW:\n`);
  console.log(`Total invoices: ${invoices?.length || 0}`);
  console.log(`Total line items: ${lines?.length || 0}`);

  // Group by month
  const byMonth = invoices?.reduce((acc: any, inv) => {
    const month = inv.invoice_date?.substring(0, 7) || 'unknown';
    if (!acc[month]) acc[month] = { count: 0, total: 0 };
    acc[month].count++;
    acc[month].total += inv.total_amount || 0;
    return acc;
  }, {});

  console.log(`\n📅 INVOICES BY MONTH (Invoice Date):\n`);
  Object.entries(byMonth || {})
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .forEach(([month, stats]: [string, any]) => {
      console.log(`  ${month}: ${stats.count} invoices ($${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    });

  // Group by vendor
  const byVendor = invoices?.reduce((acc: any, inv) => {
    const vendor = (inv.vendors as any)?.name || 'Unknown';
    if (!acc[vendor]) acc[vendor] = { count: 0, total: 0 };
    acc[vendor].count++;
    acc[vendor].total += inv.total_amount || 0;
    return acc;
  }, {});

  console.log(`\n📦 TOP VENDORS:\n`);
  Object.entries(byVendor || {})
    .sort(([, a]: any, [, b]: any) => b.count - a.count)
    .slice(0, 15)
    .forEach(([vendor, stats]: [string, any]) => {
      console.log(`  ${vendor}: ${stats.count} invoices ($${stats.total.toLocaleString('en-US', { minimumFractionDigits: 2 })})`);
    });

  // Show recent invoices
  console.log(`\n\n📋 RECENT INVOICES (Last 15):\n`);
  console.log('─'.repeat(80));

  invoices?.slice(0, 15).forEach((inv, idx) => {
    const lineData = linesByInvoice.get(inv.id);
    const lineCount = lineData?.count || 0;
    const lineTotal = lineData?.total || 0;
    const match = lineCount > 0 ? (Math.abs(inv.total_amount - lineTotal) < 1 ? '✓' : '⚠') : '✗';

    console.log(`\n${idx + 1}. Invoice #${inv.invoice_number || 'N/A'}`);
    console.log(`   Date: ${inv.invoice_date} | Vendor: ${(inv.vendors as any)?.name}`);
    console.log(`   Invoice Total: $${inv.total_amount?.toFixed(2) || '0.00'}`);
    console.log(`   Line Items: ${lineCount} items ($${lineTotal.toFixed(2)}) ${match}`);
    console.log(`   Status: ${inv.status}`);
    console.log(`   Created: ${new Date(inv.created_at).toLocaleDateString()}`);
  });

  console.log('\n' + '═'.repeat(80));

  const totalValue = invoices?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
  console.log(`\n💰 Total invoice value: $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log('═'.repeat(80));
}

getCurrentStatus()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
