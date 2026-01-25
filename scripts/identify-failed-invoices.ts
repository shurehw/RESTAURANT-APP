/**
 * Identify Failed Invoices
 * Finds all invoices with missing/incomplete line items and prepares them for re-import
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface FailedInvoice {
  id: string;
  invoice_number: string;
  vendor: string;
  invoice_total: number;
  line_items_total: number;
  line_items_count: number;
  difference: number;
  date: string;
  storage_path?: string;
  issue_type: 'no_items' | 'mismatch' | 'critical_mismatch';
}

async function identifyFailedInvoices() {
  console.log('🔍 Identifying Failed Invoices for Re-processing\n');
  console.log('═'.repeat(60));

  // Get all invoices with line items and storage paths
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      storage_path,
      vendors(name),
      invoice_lines(id, line_total)
    `)
    .order('invoice_date', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`\n📊 Analyzing ${invoices?.length || 0} invoices...\n`);

  const failedInvoices: FailedInvoice[] = [];

  invoices?.forEach((invoice: any) => {
    const lineItems = invoice.invoice_lines || [];
    const lineItemsTotal = lineItems.reduce((sum: number, line: any) => sum + (line.line_total || 0), 0);
    const diff = Math.abs(invoice.total_amount - lineItemsTotal);
    const percentDiff = invoice.total_amount > 0 ? (diff / invoice.total_amount * 100) : 100;

    // Categorize issues
    let issueType: 'no_items' | 'mismatch' | 'critical_mismatch' | null = null;

    if (lineItems.length === 0) {
      issueType = 'no_items';
    } else if (diff > 100 || percentDiff > 10) {
      // Critical: >$100 difference or >10% off
      issueType = 'critical_mismatch';
    } else if (diff > 1) {
      // Minor mismatch
      issueType = 'mismatch';
    }

    if (issueType) {
      failedInvoices.push({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        vendor: invoice.vendors?.name || 'Unknown',
        invoice_total: invoice.total_amount,
        line_items_total: lineItemsTotal,
        line_items_count: lineItems.length,
        difference: diff,
        date: invoice.invoice_date,
        storage_path: invoice.storage_path,
        issue_type: issueType
      });
    }
  });

  // Sort by severity
  const noItems = failedInvoices.filter(i => i.issue_type === 'no_items');
  const criticalMismatch = failedInvoices.filter(i => i.issue_type === 'critical_mismatch');
  const minorMismatch = failedInvoices.filter(i => i.issue_type === 'mismatch');

  console.log('📋 FAILED INVOICES SUMMARY:\n');
  console.log(`🚨 No line items: ${noItems.length}`);
  console.log(`⚠️  Critical mismatch (>$100 or >10%): ${criticalMismatch.length}`);
  console.log(`⚡ Minor mismatch (>$1): ${minorMismatch.length}`);
  console.log(`\nTotal failed: ${failedInvoices.length}\n`);

  // Calculate financial impact
  const missingValue = failedInvoices.reduce((sum, i) => sum + i.difference, 0);
  console.log(`💰 Total missing value: $${missingValue.toFixed(2)}\n`);

  // Show breakdown by vendor
  const byVendor: Record<string, FailedInvoice[]> = {};
  failedInvoices.forEach(inv => {
    if (!byVendor[inv.vendor]) byVendor[inv.vendor] = [];
    byVendor[inv.vendor].push(inv);
  });

  console.log('📊 FAILED INVOICES BY VENDOR:\n');
  Object.entries(byVendor)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([vendor, invs]) => {
      const noItemsCount = invs.filter(i => i.issue_type === 'no_items').length;
      const criticalCount = invs.filter(i => i.issue_type === 'critical_mismatch').length;
      console.log(`\n${vendor} (${invs.length} failed)`);
      if (noItemsCount > 0) console.log(`  🚨 ${noItemsCount} with no items`);
      if (criticalCount > 0) console.log(`  ⚠️  ${criticalCount} critical mismatches`);

      invs.slice(0, 5).forEach(inv => {
        console.log(`  - ${inv.invoice_number}`);
        console.log(`    Invoice: $${inv.invoice_total} | Lines: $${inv.line_items_total} | Missing: $${inv.difference.toFixed(2)}`);
      });
      if (invs.length > 5) {
        console.log(`  ... and ${invs.length - 5} more`);
      }
    });

  // Export to CSV for re-processing
  const csv = [
    'invoice_id,invoice_number,vendor,date,invoice_total,line_items_total,difference,line_items_count,issue_type,storage_path'
  ];

  failedInvoices.forEach(inv => {
    csv.push([
      inv.id,
      inv.invoice_number,
      inv.vendor,
      inv.date,
      inv.invoice_total,
      inv.line_items_total,
      inv.difference,
      inv.line_items_count,
      inv.issue_type,
      inv.storage_path || ''
    ].join(','));
  });

  fs.writeFileSync('failed-invoices.csv', csv.join('\n'));
  console.log('\n✅ Exported to: failed-invoices.csv');

  // Export priority list (critical only)
  const priorityList = [...noItems, ...criticalMismatch];
  const priorityCsv = [
    'invoice_id,invoice_number,vendor,date,invoice_total,missing_value,storage_path'
  ];

  priorityList.forEach(inv => {
    priorityCsv.push([
      inv.id,
      inv.invoice_number,
      inv.vendor,
      inv.date,
      inv.invoice_total,
      inv.difference,
      inv.storage_path || ''
    ].join(','));
  });

  fs.writeFileSync('priority-reprocess.csv', priorityCsv.join('\n'));
  console.log('✅ Exported priority list to: priority-reprocess.csv');

  // Group by storage path availability
  const withPath = failedInvoices.filter(i => i.storage_path);
  const withoutPath = failedInvoices.filter(i => !i.storage_path);

  console.log(`\n📁 STORAGE PATH STATUS:\n`);
  console.log(`Invoices with storage path: ${withPath.length} (can auto re-process)`);
  console.log(`Invoices without storage path: ${withoutPath.length} (need manual upload)\n`);

  if (withoutPath.length > 0) {
    console.log('⚠️  Invoices needing manual upload:');
    withoutPath.slice(0, 20).forEach(inv => {
      console.log(`  - ${inv.vendor} | ${inv.invoice_number} | $${inv.invoice_total}`);
    });
    if (withoutPath.length > 20) {
      console.log(`  ... and ${withoutPath.length - 20} more`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Review failed-invoices.csv for all issues');
  console.log('2. Review priority-reprocess.csv for critical issues');
  console.log(`3. Re-process ${withPath.length} invoices with storage paths`);
  console.log(`4. Manually upload ${withoutPath.length} missing PDFs\n`);
}

identifyFailedInvoices();
