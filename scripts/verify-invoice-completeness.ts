/**
 * Verify Invoice Completeness
 * Checks if invoices have all their line items by comparing:
 * - Invoice total vs sum of line items
 * - Expected line counts vs actual
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyCompleteness() {
  console.log('🔍 Verifying Invoice Completeness\n');
  console.log('═'.repeat(60));

  // Get all invoices with their line items
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      vendors(name),
      invoice_lines(id, line_total)
    `)
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`\n📊 Analyzing ${invoices?.length || 0} invoices...\n`);

  let missingItemsCount = 0;
  let totalMismatchValue = 0;
  const problematicInvoices: any[] = [];

  invoices?.forEach((invoice: any) => {
    const lineItems = invoice.invoice_lines || [];
    const lineItemsTotal = lineItems.reduce((sum: number, line: any) => sum + (line.line_total || 0), 0);
    const diff = Math.abs(invoice.total_amount - lineItemsTotal);

    // Flag if difference > $1 or if no line items
    if (diff > 1 || lineItems.length === 0) {
      problematicInvoices.push({
        invoice_number: invoice.invoice_number,
        vendor: invoice.vendors?.name || 'Unknown',
        invoice_total: invoice.total_amount,
        line_items_total: lineItemsTotal,
        line_items_count: lineItems.length,
        difference: diff,
        date: invoice.invoice_date
      });

      if (lineItems.length === 0) {
        missingItemsCount++;
      }
      totalMismatchValue += diff;
    }
  });

  console.log(`\n📋 RESULTS:\n`);
  console.log(`Total invoices: ${invoices?.length || 0}`);
  console.log(`Invoices with issues: ${problematicInvoices.length}`);
  console.log(`Invoices with NO line items: ${missingItemsCount}`);
  console.log(`Total mismatch value: $${totalMismatchValue.toFixed(2)}\n`);

  if (problematicInvoices.length > 0) {
    console.log('⚠️  PROBLEMATIC INVOICES:\n');

    // Group by issue type
    const noLineItems = problematicInvoices.filter(i => i.line_items_count === 0);
    const mismatch = problematicInvoices.filter(i => i.line_items_count > 0);

    if (noLineItems.length > 0) {
      console.log(`🚨 ${noLineItems.length} invoices with NO line items:\n`);
      noLineItems.slice(0, 20).forEach(inv => {
        console.log(`  - ${inv.vendor} | ${inv.invoice_number}`);
        console.log(`    Date: ${inv.date} | Total: $${inv.invoice_total}`);
      });
      if (noLineItems.length > 20) {
        console.log(`  ... and ${noLineItems.length - 20} more`);
      }
    }

    if (mismatch.length > 0) {
      console.log(`\n⚠️  ${mismatch.length} invoices with total mismatches:\n`);
      mismatch
        .sort((a, b) => b.difference - a.difference)
        .slice(0, 20)
        .forEach(inv => {
          console.log(`  - ${inv.vendor} | ${inv.invoice_number}`);
          console.log(`    Invoice: $${inv.invoice_total.toFixed(2)} | Lines: $${inv.line_items_total.toFixed(2)} | Diff: $${inv.difference.toFixed(2)}`);
          console.log(`    Line items: ${inv.line_items_count}`);
        });
      if (mismatch.length > 20) {
        console.log(`  ... and ${mismatch.length - 20} more`);
      }
    }
  } else {
    console.log('✅ All invoices have matching line items!');
  }

  // Summary statistics
  const totalInvoiceValue = invoices?.reduce((sum: number, inv: any) => sum + (inv.total_amount || 0), 0) || 0;
  const totalLineItemsValue = invoices?.reduce((sum: number, inv: any) => {
    const lineTotal = (inv.invoice_lines || []).reduce((s: number, line: any) => s + (line.line_total || 0), 0);
    return sum + lineTotal;
  }, 0) || 0;

  console.log(`\n💰 FINANCIAL SUMMARY:\n`);
  console.log(`Total invoice value: $${totalInvoiceValue.toFixed(2)}`);
  console.log(`Total line items value: $${totalLineItemsValue.toFixed(2)}`);
  console.log(`Difference: $${Math.abs(totalInvoiceValue - totalLineItemsValue).toFixed(2)}`);

  const accuracy = totalInvoiceValue > 0 ? (totalLineItemsValue / totalInvoiceValue * 100) : 0;
  console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
}

verifyCompleteness();
