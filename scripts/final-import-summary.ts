import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getFinalSummary() {
  console.log('📊 FINAL IMPORT SUMMARY - January 24-25, 2026');
  console.log('═'.repeat(70));

  // Get all invoices from today
  const { data: invoices, count: totalInvoices } = await supabase
    .from('invoices')
    .select('id, vendor_id, invoice_number, invoice_date, total_amount, created_at', { count: 'exact' })
    .gte('created_at', '2026-01-24')
    .order('created_at', { ascending: false });

  console.log(`\n✅ TOTAL INVOICES IMPORTED: ${totalInvoices}`);

  // Get line items count
  if (invoices && invoices.length > 0) {
    const invoiceIds = invoices.map(inv => inv.id);
    const { count: totalLines } = await supabase
      .from('invoice_lines')
      .select('id, item_id', { count: 'exact' })
      .in('invoice_id', invoiceIds);

    const { count: matchedLines } = await supabase
      .from('invoice_lines')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds)
      .not('item_id', 'is', null);

    console.log(`\n📦 LINE ITEMS:`);
    console.log(`   Total: ${totalLines}`);
    console.log(`   Matched to existing items: ${matchedLines} (${((matchedLines / totalLines) * 100).toFixed(1)}%)`);
    console.log(`   New/Unmatched: ${totalLines - matchedLines} (${(((totalLines - matchedLines) / totalLines) * 100).toFixed(1)}%)`);
  }

  // Get vendor breakdown
  const { data: vendorBreakdown } = await supabase
    .from('invoices')
    .select('vendor_id, vendors(name)')
    .gte('created_at', '2026-01-24');

  const vendorCounts = new Map<string, number>();
  vendorBreakdown?.forEach(inv => {
    const vendorName = (inv.vendors as any)?.name || 'Unknown';
    vendorCounts.set(vendorName, (vendorCounts.get(vendorName) || 0) + 1);
  });

  console.log(`\n🏢 TOP 10 VENDORS BY INVOICE COUNT:`);
  const sortedVendors = Array.from(vendorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  sortedVendors.forEach(([vendor, count], i) => {
    console.log(`   ${i + 1}. ${vendor}: ${count} invoices`);
  });

  // Get new vendors created today
  const { data: newVendors, count: newVendorCount } = await supabase
    .from('vendors')
    .select('name', { count: 'exact' })
    .gte('created_at', '2026-01-24')
    .order('created_at', { ascending: false });

  console.log(`\n🆕 NEW VENDORS CREATED: ${newVendorCount}`);
  if (newVendors && newVendors.length > 0) {
    console.log('   Recent vendors:');
    newVendors.slice(0, 15).forEach(v => {
      console.log(`   - ${v.name}`);
    });
    if (newVendors.length > 15) {
      console.log(`   ... and ${newVendors.length - 15} more`);
    }
  }

  // Get date range
  if (invoices && invoices.length > 0) {
    const dates = invoices.map(inv => inv.invoice_date).filter(d => d).sort();
    console.log(`\n📅 INVOICE DATE RANGE:`);
    console.log(`   Earliest: ${dates[0]}`);
    console.log(`   Latest: ${dates[dates.length - 1]}`);
  }

  // Get total amount
  const { data: amountData } = await supabase
    .from('invoices')
    .select('total_amount')
    .gte('created_at', '2026-01-24')
    .not('total_amount', 'is', null);

  if (amountData) {
    const totalAmount = amountData.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
    console.log(`\n💰 TOTAL INVOICE AMOUNT: $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }

  // Import sources breakdown
  console.log(`\n📂 IMPORT SOURCES:`);
  console.log(`   1. "Multiple Food - Small" folder: ~140 PDFs (split from 11 large PDFs)`);
  console.log(`   2. "delilah_dallas_invoices__food_1": 151 invoices (split from 8 multi-page PDFs)`);
  console.log(`   3. Earlier beverage/food imports`);

  console.log(`\n✅ IMPORT SESSION COMPLETE`);
  console.log('═'.repeat(70));
}

getFinalSummary();
