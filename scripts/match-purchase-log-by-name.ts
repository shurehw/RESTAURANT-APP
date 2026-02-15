/**
 * Match Purchase Log Items by Name
 * Try to match purchase log items to database items by name similarity
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function findBestMatch(searchName: string, dbItems: any[]): any | null {
  const normalizedSearch = normalizeItemName(searchName);

  // Try exact match first
  let match = dbItems.find(item =>
    normalizeItemName(item.name) === normalizedSearch
  );

  if (match) return { item: match, matchType: 'exact' };

  // Try partial match (contains)
  match = dbItems.find(item =>
    normalizeItemName(item.name).includes(normalizedSearch) ||
    normalizedSearch.includes(normalizeItemName(item.name))
  );

  if (match) return { item: match, matchType: 'partial' };

  return null;
}

async function matchByName() {
  console.log('🔍 Matching Purchase Log Items by Name\n');

  // Read purchase log
  const workbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Parse purchases (skip header rows)
  const purchases: any[] = [];
  for (let i = 6; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 10) continue;

    purchases.push({
      sku: row[2] || '',
      item: row[3] || '',
      packSize: row[4] || '',
      vendor: row[8] || '',
      amount: parseFloat(row[13]) || 0
    });
  }

  // Get unique items from purchase log
  const uniquePurchases = Array.from(
    new Map(purchases.map(p => [p.sku, p])).values()
  ).filter(p => p.item && p.sku);

  console.log(`Purchase Log: ${uniquePurchases.length} unique items\n`);

  // Get all database items
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, sku, name, category');

  console.log(`Database: ${dbItems?.length || 0} items\n`);

  // Try to match
  const matches: any[] = [];
  const noMatches: any[] = [];

  for (const purchase of uniquePurchases) {
    const match = findBestMatch(purchase.item, dbItems || []);

    if (match) {
      matches.push({
        purchaseSku: purchase.sku,
        purchaseItem: purchase.item,
        dbSku: match.item.sku,
        dbItem: match.item.name,
        matchType: match.matchType,
        packSize: purchase.packSize,
        vendor: purchase.vendor
      });
    } else {
      noMatches.push(purchase);
    }
  }

  // Calculate spending for unmatched items
  const unmatchedWithSpend = noMatches.map(item => {
    const records = purchases.filter(p => p.sku === item.sku);
    const totalSpend = records.reduce((sum, p) => sum + p.amount, 0);
    return { ...item, totalSpend, orderCount: records.length };
  }).sort((a, b) => b.totalSpend - a.totalSpend);

  // Results
  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 MATCHING RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`✅ Matched: ${matches.length} items`);
  console.log(`   - Exact matches: ${matches.filter(m => m.matchType === 'exact').length}`);
  console.log(`   - Partial matches: ${matches.filter(m => m.matchType === 'partial').length}`);
  console.log(`❌ Not matched: ${noMatches.length} items\n`);

  if (matches.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SAMPLE MATCHES (First 20)');
    console.log('═══════════════════════════════════════════════════════\n');

    matches.slice(0, 20).forEach(m => {
      console.log(`Purchase: ${m.purchaseSku} - ${m.purchaseItem}`);
      console.log(`DB:       ${m.dbSku} - ${m.dbItem}`);
      console.log(`Match:    ${m.matchType.toUpperCase()}`);
      console.log(`Pack:     ${m.packSize}\n`);
    });
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('❌ UNMATCHED ITEMS - TOP 30 BY SPEND');
  console.log('═══════════════════════════════════════════════════════\n');

  unmatchedWithSpend.slice(0, 30).forEach(item => {
    console.log(`SKU: ${item.sku}`);
    console.log(`  Item: ${item.item}`);
    console.log(`  Pack: ${item.packSize}`);
    console.log(`  Vendor: ${item.vendor}`);
    console.log(`  Spend: $${item.totalSpend.toLocaleString()} (${item.orderCount} orders)\n`);
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('🎯 SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const unmatchedSpend = unmatchedWithSpend.reduce((sum, item) => sum + item.totalSpend, 0);

  console.log(`Match Rate: ${((matches.length / uniquePurchases.length) * 100).toFixed(1)}%`);
  console.log(`Unmatched Spend: $${unmatchedSpend.toLocaleString()}\n`);

  if (noMatches.length > 0) {
    console.log('🎯 RECOMMENDATION:\n');
    console.log(`You need to add ${noMatches.length} items from the purchase log to your database.`);
    console.log(`These represent $${unmatchedSpend.toLocaleString()} in annual purchases.\n`);
  }
}

matchByName().catch(console.error);
