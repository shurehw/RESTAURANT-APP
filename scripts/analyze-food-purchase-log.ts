/**
 * Analyze Food Purchase Log
 * Compare actual food purchases against database items
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PurchaseRecord {
  store: string;
  id: string;
  sku: string;
  item: string;
  packSize: string;
  category: string;
  subcategory: string;
  vendor: string;
  invoiceNo: string;
  receivedDate: string;
  invoiceDate: string;
  quantity: number;
  amount: number;
  cuPrice: number;
}

function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function findBestMatch(searchName: string, dbItems: any[]): any | null {
  const normalizedSearch = normalizeItemName(searchName);

  // Exact match
  let match = dbItems.find(item =>
    normalizeItemName(item.name) === normalizedSearch
  );
  if (match) return { item: match, matchType: 'exact' };

  // Partial match
  match = dbItems.find(item =>
    normalizeItemName(item.name).includes(normalizedSearch) ||
    normalizedSearch.includes(normalizeItemName(item.name))
  );
  if (match) return { item: match, matchType: 'partial' };

  return null;
}

async function analyzeFoodPurchaseLog() {
  console.log('🍽️  Analyzing Food Purchase Log\n');

  // Read Excel
  const workbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Parse purchases (skip header rows)
  const purchases: PurchaseRecord[] = [];
  for (let i = 6; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length < 10) continue;

    purchases.push({
      store: row[0] || '',
      id: row[1] || '',
      sku: row[2] || '',
      item: row[3] || '',
      packSize: row[4] || '',
      category: row[5] || '',
      subcategory: row[6] || '',
      vendor: row[7] || '',
      invoiceNo: row[8] || '',
      receivedDate: row[9] || '',
      invoiceDate: row[10] || '',
      quantity: parseFloat(row[11]) || 0,
      amount: parseFloat(row[12]) || 0,
      cuPrice: parseFloat(row[13]) || 0
    });
  }

  console.log(`✅ Loaded ${purchases.length} purchase records\n`);

  // Get database items
  const { data: dbItems } = await supabase
    .from('items')
    .select('id, sku, name, category');

  console.log(`Database: ${dbItems?.length || 0} items\n`);

  // Unique values analysis
  const uniqueVendors = new Set<string>();
  const uniquePackSizes = new Set<string>();
  const uniqueCategories = new Set<string>();
  const vendorSkuMap = new Map<string, Set<string>>();

  purchases.forEach(p => {
    if (p.vendor) uniqueVendors.add(p.vendor);
    if (p.packSize) uniquePackSizes.add(p.packSize);
    if (p.category) uniqueCategories.add(p.category);

    if (p.vendor && p.sku) {
      if (!vendorSkuMap.has(p.vendor)) {
        vendorSkuMap.set(p.vendor, new Set());
      }
      vendorSkuMap.get(p.vendor)!.add(p.sku);
    }
  });

  // Get unique purchased items
  const uniquePurchases = Array.from(
    new Map(purchases.map(p => [p.sku, p])).values()
  ).filter(p => p.item && p.sku);

  console.log(`Unique Items Purchased: ${uniquePurchases.length}\n`);

  // Match by SKU
  const existingSkus = new Set(dbItems?.map(i => i.sku) || []);
  const matchedBySku = uniquePurchases.filter(p => existingSkus.has(p.sku));
  const unmatchedBySku = uniquePurchases.filter(p => !existingSkus.has(p.sku));

  // Match by name
  const matchedByName: any[] = [];
  const completelyUnmatched: any[] = [];

  for (const purchase of unmatchedBySku) {
    const match = findBestMatch(purchase.item, dbItems || []);
    if (match) {
      matchedByName.push({
        purchaseSku: purchase.sku,
        purchaseItem: purchase.item,
        dbSku: match.item.sku,
        dbItem: match.item.name,
        matchType: match.matchType,
        packSize: purchase.packSize,
        vendor: purchase.vendor
      });
    } else {
      completelyUnmatched.push(purchase);
    }
  }

  // Calculate spending for unmatched
  const unmatchedWithSpend = completelyUnmatched.map(item => {
    const records = purchases.filter(p => p.sku === item.sku);
    const totalSpend = records.reduce((sum, p) => sum + p.amount, 0);
    return { ...item, totalSpend, orderCount: records.length };
  }).sort((a, b) => b.totalSpend - a.totalSpend);

  // Vendor analysis
  const vendorStats = Array.from(uniqueVendors).map(vendor => {
    const records = purchases.filter(p => p.vendor === vendor);
    const totalAmount = records.reduce((sum, p) => sum + p.amount, 0);
    const skuCount = vendorSkuMap.get(vendor)?.size || 0;
    return { vendor, orderCount: records.length, totalAmount, skuCount };
  }).sort((a, b) => b.totalAmount - a.totalAmount);

  // Pack sizes
  const packSizeStats = Array.from(uniquePackSizes).map(packSize => {
    const count = purchases.filter(p => p.packSize === packSize).length;
    return { packSize, count };
  }).sort((a, b) => b.count - a.count);

  // Results
  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 TOP VENDORS BY SPEND');
  console.log('═══════════════════════════════════════════════════════\n');

  vendorStats.slice(0, 10).forEach(v => {
    console.log(`${v.vendor}`);
    console.log(`  Orders: ${v.orderCount} | SKUs: ${v.skuCount} | Total: $${v.totalAmount.toLocaleString()}\n`);
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('📦 MOST COMMON PACK SIZES');
  console.log('═══════════════════════════════════════════════════════\n');

  packSizeStats.slice(0, 20).forEach(p => {
    console.log(`${p.packSize.padEnd(30)} : ${p.count} purchases`);
  });
  console.log('');

  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 MATCHING RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  const totalMatched = matchedBySku.length + matchedByName.length;
  console.log(`✅ Total Matched: ${totalMatched} items`);
  console.log(`   - Matched by SKU: ${matchedBySku.length}`);
  console.log(`   - Matched by Name: ${matchedByName.length}`);
  console.log(`     • Exact: ${matchedByName.filter(m => m.matchType === 'exact').length}`);
  console.log(`     • Partial: ${matchedByName.filter(m => m.matchType === 'partial').length}`);
  console.log(`❌ Unmatched: ${completelyUnmatched.length} items\n`);

  const matchRate = ((totalMatched / uniquePurchases.length) * 100).toFixed(1);
  console.log(`Match Rate: ${matchRate}%\n`);

  if (matchedByName.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ SAMPLE NAME MATCHES (First 20)');
    console.log('═══════════════════════════════════════════════════════\n');

    matchedByName.slice(0, 20).forEach(m => {
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
    console.log(`  Category: ${item.category}`);
    console.log(`  Vendor: ${item.vendor}`);
    console.log(`  Spend: $${item.totalSpend.toLocaleString()} (${item.orderCount} orders)\n`);
  });

  console.log('═══════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const unmatchedSpend = unmatchedWithSpend.reduce((sum, item) => sum + item.totalSpend, 0);
  const totalSpend = purchases.reduce((sum, p) => sum + p.amount, 0);

  console.log(`Total Purchase Records: ${purchases.length}`);
  console.log(`Unique Items Purchased: ${uniquePurchases.length}`);
  console.log(`Total Vendors: ${uniqueVendors.size}`);
  console.log(`Total Pack Sizes: ${uniquePackSizes.size}`);
  console.log(`Total Spend: $${totalSpend.toLocaleString()}\n`);

  console.log(`✅ Matched Items: ${totalMatched} (${matchRate}%)`);
  console.log(`❌ Unmatched Items: ${completelyUnmatched.length}`);
  console.log(`   Unmatched Spend: $${unmatchedSpend.toLocaleString()}\n`);

  console.log('🎯 RECOMMENDATION:\n');
  console.log(`Add ${completelyUnmatched.length} food items to database`);
  console.log(`This represents $${unmatchedSpend.toLocaleString()} in annual purchases\n`);
}

analyzeFoodPurchaseLog().catch(console.error);
