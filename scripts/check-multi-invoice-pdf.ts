/**
 * Check for PDFs that contain multiple invoices
 * Triggered by user finding invoice 1B8357 (1/22/2026) has 2 pages with 2 different invoices
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMultiInvoicePDF() {
  console.log('🔍 Checking invoice 1B8357...\n');

  // Find the specific invoice(s) - may be duplicates!
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      storage_path,
      vendor_id,
      vendors(name)
    `)
    .eq('invoice_number', '1B8357');

  if (error) {
    console.error('Error finding invoice:', error);
    return;
  }

  if (!invoices || invoices.length === 0) {
    console.log('Invoice 1B8357 not found');
    return;
  }

  console.log(`🚨 FOUND ${invoices.length} INVOICES WITH NUMBER "1B8357":`);
  console.log();

  invoices.forEach((invoice, idx) => {
    console.log(`Invoice ${idx + 1}:`);
    console.log('  ID:', invoice.id);
    console.log('  Number:', invoice.invoice_number);
    console.log('  Date:', invoice.invoice_date);
    console.log('  Vendor:', (invoice.vendors as any)?.name);
    console.log('  Amount:', invoice.total_amount);
    console.log('  Storage Path:', invoice.storage_path);
    console.log();
  });

  const invoice = invoices[0]; // Use first one for further checks

  // Check if there are other invoices from same upload session (same storage path directory)
  if (invoice.storage_path) {
    const directory = path.dirname(invoice.storage_path);

    const { data: relatedInvoices, error: relatedError } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, storage_path')
      .like('storage_path', `${directory}%`)
      .order('invoice_date', { ascending: true });

    if (relatedError) {
      console.error('Error finding related invoices:', relatedError);
    } else if (relatedInvoices && relatedInvoices.length > 1) {
      console.log(`📁 Found ${relatedInvoices.length} invoices in same directory:`);
      relatedInvoices.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.invoice_number} - ${inv.invoice_date} - $${inv.total_amount}`);
        console.log(`     ${inv.storage_path}`);
      });
      console.log();
    }
  }

  // Check for invoices from same date with same vendor
  const { data: sameDateInvoices, error: dateError } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, total_amount, storage_path')
    .eq('vendor_id', invoice.vendor_id)
    .eq('invoice_date', invoice.invoice_date)
    .order('invoice_number', { ascending: true });

  if (dateError) {
    console.error('Error finding same-date invoices:', dateError);
  } else if (sameDateInvoices && sameDateInvoices.length > 1) {
    console.log(`📅 Found ${sameDateInvoices.length} invoices from same vendor on same date:`);
    sameDateInvoices.forEach((inv, idx) => {
      console.log(`  ${idx + 1}. ${inv.invoice_number} - $${inv.total_amount}`);
    });
    console.log();
  }

  // Check for recent bulk imports that might have this issue
  console.log('🔎 Checking for other potential multi-invoice PDFs from recent imports...\n');

  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 7);

  const { data: recentInvoices, error: recentError } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_date, vendor_id, vendors(name), storage_path, total_amount')
    .gte('created_at', oneDayAgo.toISOString())
    .order('created_at', { ascending: false });

  if (recentError) {
    console.error('Error finding recent invoices:', recentError);
  } else if (recentInvoices) {
    // Group by storage path to find potential duplicates
    const byStoragePath = new Map<string, typeof recentInvoices>();

    for (const inv of recentInvoices) {
      if (inv.storage_path) {
        const dir = path.dirname(inv.storage_path);
        if (!byStoragePath.has(dir)) {
          byStoragePath.set(dir, []);
        }
        byStoragePath.get(dir)!.push(inv);
      }
    }

    console.log(`Found ${recentInvoices.length} recent invoices in last 7 days`);
    console.log(`Grouped into ${byStoragePath.size} unique storage directories\n`);

    // Show directories with suspicious patterns
    let suspiciousCount = 0;
    for (const [dir, invoices] of byStoragePath.entries()) {
      // Check for same vendor, same date but different invoice numbers
      const vendorDateGroups = new Map<string, typeof invoices>();

      for (const inv of invoices) {
        const key = `${inv.vendor_id}_${inv.invoice_date}`;
        if (!vendorDateGroups.has(key)) {
          vendorDateGroups.set(key, []);
        }
        vendorDateGroups.get(key)!.push(inv);
      }

      for (const [key, group] of vendorDateGroups.entries()) {
        if (group.length > 1) {
          suspiciousCount++;
          console.log(`⚠️  Suspicious group ${suspiciousCount}:`);
          console.log(`   Vendor: ${(group[0].vendors as any)?.name}`);
          console.log(`   Date: ${group[0].invoice_date}`);
          console.log(`   Count: ${group.length} invoices`);
          group.forEach((inv, idx) => {
            console.log(`   ${idx + 1}. ${inv.invoice_number} - $${inv.total_amount}`);
          });
          console.log();
        }
      }
    }

    if (suspiciousCount === 0) {
      console.log('✅ No suspicious multi-invoice patterns found in recent imports');
    } else {
      console.log(`\n⚠️  Found ${suspiciousCount} suspicious groups that may need review`);
    }
  }
}

checkMultiInvoicePDF().catch(console.error);
