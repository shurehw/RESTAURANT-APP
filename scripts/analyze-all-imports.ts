import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function analyze() {
  // Get all invoice lines
  const { data: allLines } = await supabase
    .from('invoice_lines')
    .select('invoice_id, description, item_id, created_at')
    .order('created_at', { ascending: false });

  const matched = allLines?.filter(l => l.item_id) || [];
  const unmatched = allLines?.filter(l => !l.item_id) || [];

  console.log('\n📊 OVERALL IMPORT STATISTICS');
  console.log('═'.repeat(70));
  console.log(`Total invoice lines imported: ${allLines?.length || 0}`);
  console.log(`✅ Matched: ${matched.length} (${((matched.length / (allLines?.length || 1)) * 100).toFixed(1)}%)`);
  console.log(`❌ Unmatched: ${unmatched.length} (${((unmatched.length / (allLines?.length || 1)) * 100).toFixed(1)}%)`);

  // Get unique invoices
  const invoiceIds = [...new Set(allLines?.map(l => l.invoice_id))];

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, vendor_id, created_at, status')
    .in('id', invoiceIds)
    .order('created_at', { ascending: false });

  console.log(`\n📋 Invoices processed: ${invoices?.length || 0}`);

  // Get vendor breakdown
  const { data: vendors } = await supabase
    .from('vendors')
    .select('id, name');

  const vendorMap = new Map(vendors?.map(v => [v.id, v.name]));

  // Analyze by vendor
  const vendorStats = new Map<string, { total: number; matched: number; unmatched: number }>();

  invoices?.forEach(inv => {
    const vendorName = vendorMap.get(inv.vendor_id) || 'Unknown';
    const lines = allLines?.filter(l => l.invoice_id === inv.id) || [];
    const matchedLines = lines.filter(l => l.item_id);

    const current = vendorStats.get(vendorName) || { total: 0, matched: 0, unmatched: 0 };
    vendorStats.set(vendorName, {
      total: current.total + lines.length,
      matched: current.matched + matchedLines.length,
      unmatched: current.unmatched + (lines.length - matchedLines.length)
    });
  });

  console.log('\n\n📈 MATCHING BY VENDOR');
  console.log('═'.repeat(70));

  const sortedVendors = Array.from(vendorStats.entries())
    .sort((a, b) => b[1].total - a[1].total);

  sortedVendors.forEach(([vendor, stats]) => {
    const matchRate = ((stats.matched / stats.total) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(parseFloat(matchRate) / 5));
    console.log(`\n${vendor}:`);
    console.log(`  Lines: ${stats.total} | Matched: ${stats.matched} (${matchRate}%)`);
    console.log(`  ${bar}`);
  });

  // Recent unmatched items
  console.log('\n\n🔍 RECENT UNMATCHED ITEMS (Last 20)');
  console.log('═'.repeat(70));
  unmatched.slice(0, 20).forEach((line, idx) => {
    console.log(`${idx + 1}. ${line.description}`);
  });

  // Get all items created
  const { data: allItems } = await supabase
    .from('items')
    .select('id, name, category, gl_account_id, created_at')
    .order('created_at', { ascending: false });

  console.log('\n\n📦 ITEM CATALOG STATS');
  console.log('═'.repeat(70));
  console.log(`Total items in catalog: ${allItems?.length || 0}`);

  const withGL = allItems?.filter(i => i.gl_account_id).length || 0;
  console.log(`Items with GL account: ${withGL} (${((withGL / (allItems?.length || 1)) * 100).toFixed(1)}%)`);

  // Category breakdown
  const categoryStats = new Map<string, number>();
  allItems?.forEach(item => {
    const cat = item.category || 'uncategorized';
    categoryStats.set(cat, (categoryStats.get(cat) || 0) + 1);
  });

  console.log('\n📊 Items by Category:');
  Array.from(categoryStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });

  // Invoice status breakdown
  const statusStats = new Map<string, number>();
  invoices?.forEach(inv => {
    const status = inv.status || 'unknown';
    statusStats.set(status, (statusStats.get(status) || 0) + 1);
  });

  console.log('\n\n📋 INVOICE STATUS');
  console.log('═'.repeat(70));
  Array.from(statusStats.entries()).forEach(([status, count]) => {
    console.log(`${status}: ${count}`);
  });
}

analyze();
