/**
 * Identify Failed Food Invoices from Multiple Food folder
 * Finds which SYSCO food invoices have missing/incomplete line items
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

const FOOD_FOLDER = 'C:\\Users\\JacobShure\\OneDrive - Hwood Group\\Finance - Delilah Dallas Finance - Temp Invoice Scans\\Multiple Food';

async function identifyFailedFoodInvoices() {
  console.log('🔍 Identifying Failed SYSCO Food Invoices\n');
  console.log('═'.repeat(60));

  // Get all SYSCO invoices for Delilah Dallas
  const { data: invoices } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      invoice_date,
      total_amount,
      vendors!inner(name),
      venues!inner(name),
      invoice_lines(id, line_total)
    `)
    .ilike('vendors.name', '%SYSCO%')
    .ilike('venues.name', '%Delilah%');

  console.log(`\n📊 Found ${invoices?.length || 0} SYSCO invoices for Delilah Dallas\n`);

  const failed: any[] = [];
  const successful: any[] = [];

  invoices?.forEach((inv: any) => {
    const lineItems = inv.invoice_lines || [];
    const lineTotal = lineItems.reduce((sum: number, l: any) => sum + (l.line_total || 0), 0);
    const diff = Math.abs(inv.total_amount - lineTotal);
    const percentDiff = inv.total_amount > 0 ? (diff / inv.total_amount * 100) : 100;

    if (lineItems.length === 0 || diff > 10 || percentDiff > 5) {
      failed.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        vendor: inv.vendors?.name || 'Unknown',
        venue: inv.venues?.name || 'Unknown',
        date: inv.invoice_date,
        total: inv.total_amount,
        line_total: lineTotal,
        line_count: lineItems.length,
        diff,
        percentDiff
      });
    } else {
      successful.push(inv);
    }
  });

  console.log('📋 RESULTS:\n');
  console.log(`✅ Complete & Accurate: ${successful.length}`);
  console.log(`❌ Failed/Incomplete: ${failed.length}\n`);

  if (failed.length > 0) {
    console.log('🚨 FAILED INVOICES:\n');

    // Sort by missing value
    failed.sort((a, b) => b.diff - a.diff);

    failed.forEach((inv, idx) => {
      console.log(`${idx + 1}. ${inv.invoice_number} | ${inv.date}`);
      console.log(`   Invoice: $${inv.total} | Lines: $${inv.line_total.toFixed(2)} | Missing: $${inv.diff.toFixed(2)} (${inv.percentDiff.toFixed(1)}%)`);
      console.log(`   Line items: ${inv.line_count}\n`);
    });

    const totalMissing = failed.reduce((sum, i) => sum + i.diff, 0);
    console.log(`💰 Total missing value: $${totalMissing.toFixed(2)}\n`);

    // Save failed invoice numbers for re-import
    const failedNumbers = failed.map(i => i.invoice_number);
    fs.writeFileSync('failed-food-invoices.json', JSON.stringify({
      total: failed.length,
      total_missing: totalMissing,
      invoices: failed,
      invoice_numbers: failedNumbers
    }, null, 2));

    console.log('✅ Saved to: failed-food-invoices.json\n');
  }

  // Check what PDFs are available in the folder
  console.log('═'.repeat(60));
  console.log('\n📁 Checking available PDFs in Multiple Food folder...\n');

  if (fs.existsSync(FOOD_FOLDER)) {
    const files = fs.readdirSync(FOOD_FOLDER).filter(f => f.toLowerCase().endsWith('.pdf'));
    console.log(`Found ${files.length} PDF files\n`);

    if (files.length > 0) {
      console.log('Sample PDFs:');
      files.slice(0, 10).forEach(f => console.log(`  - ${f}`));
      if (files.length > 10) {
        console.log(`  ... and ${files.length - 10} more`);
      }
    }

    console.log(`\n✅ ${files.length} PDFs available for re-import\n`);
  } else {
    console.log(`❌ Folder not found: ${FOOD_FOLDER}\n`);
  }

  console.log('═'.repeat(60));
  console.log('\n📋 NEXT STEPS:\n');
  console.log(`1. Delete ${failed.length} failed invoices from database`);
  console.log(`2. Re-import PDFs from Multiple Food folder`);
  console.log(`3. Validate 100% accuracy\n`);
}

identifyFailedFoodInvoices();
