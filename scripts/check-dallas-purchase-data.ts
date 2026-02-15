/**
 * Check Dallas Items in Purchase Logs
 */

import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDallasPurchaseData() {
  console.log('🔍 Checking Dallas Items in Purchase Logs\n');

  // Get Dallas venue
  const { data: dallas } = await supabase
    .from('venues')
    .select('id, name')
    .ilike('name', '%dallas%')
    .single();

  console.log(`Dallas Venue: ${dallas?.name} (${dallas?.id})\n`);

  // Read purchase logs
  const bevWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Bevager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const bevSheet = bevWorkbook.Sheets[bevWorkbook.SheetNames[0]];
  const bevData: any[][] = XLSX.utils.sheet_to_json(bevSheet, { header: 1 });

  const foodWorkbook = XLSX.readFile('G:/My Drive/Downloads/Director - Foodager - Purchase Log 2025-01-01 2026-02-09.xlsx');
  const foodSheet = foodWorkbook.Sheets[foodWorkbook.SheetNames[0]];
  const foodData: any[][] = XLSX.utils.sheet_to_json(foodSheet, { header: 1 });

  console.log('Purchase Log Headers (Beverage):');
  console.log(bevData[0]);
  console.log('\nFirst data row (Beverage):');
  console.log(bevData[6]);

  console.log('\n\nPurchase Log Headers (Food):');
  console.log(foodData[0]);
  console.log('\nFirst data row (Food):');
  console.log(foodData[6]);

  // Parse all purchases and look for Dallas
  const dallasBevPurchases: any[] = [];
  const dallasFoodPurchases: any[] = [];

  // Beverage (assuming Store/Venue is in column 0)
  for (let i = 6; i < bevData.length; i++) {
    const row = bevData[i];
    if (!row || row.length < 4) continue;

    const store = (row[0] || '').toString().toLowerCase();
    if (store.includes('dallas') || store.includes('delilah dallas')) {
      dallasBevPurchases.push({
        store: row[0],
        sku: row[2],
        item: row[3],
        packSize: row[4],
        vendor: row[8],
        amount: parseFloat(row[13]) || 0
      });
    }
  }

  // Food (assuming Store/Venue is in column 0)
  for (let i = 6; i < foodData.length; i++) {
    const row = foodData[i];
    if (!row || row.length < 4) continue;

    const store = (row[0] || '').toString().toLowerCase();
    if (store.includes('dallas') || store.includes('delilah dallas')) {
      dallasFoodPurchases.push({
        store: row[0],
        sku: row[2],
        item: row[3],
        packSize: row[4],
        vendor: row[7],
        amount: parseFloat(row[12]) || 0
      });
    }
  }

  console.log(`\n\n═══════════════════════════════════════════════════════`);
  console.log('📊 DALLAS PURCHASE DATA');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Dallas Beverage Purchases: ${dallasBevPurchases.length}`);
  console.log(`Dallas Food Purchases: ${dallasFoodPurchases.length}\n`);

  if (dallasBevPurchases.length > 0) {
    console.log('Sample Dallas Beverage Purchases (first 10):');
    dallasBevPurchases.slice(0, 10).forEach(p => {
      console.log(`  ${p.sku} - ${p.item}`);
      console.log(`    Vendor: ${p.vendor} | $${p.amount}`);
    });
    console.log();
  }

  if (dallasFoodPurchases.length > 0) {
    console.log('Sample Dallas Food Purchases (first 10):');
    dallasFoodPurchases.slice(0, 10).forEach(p => {
      console.log(`  ${p.sku} - ${p.item}`);
      console.log(`    Vendor: ${p.vendor} | $${p.amount}`);
    });
    console.log();
  }

  // Get unique Dallas items
  const uniqueDallasBev = Array.from(
    new Map(dallasBevPurchases.map(p => [p.sku, p])).values()
  );

  const uniqueDallasFood = Array.from(
    new Map(dallasFoodPurchases.map(p => [p.sku, p])).values()
  );

  console.log(`Unique Dallas Beverage Items: ${uniqueDallasBev.length}`);
  console.log(`Unique Dallas Food Items: ${uniqueDallasFood.length}`);

  const totalDallasSpend =
    dallasBevPurchases.reduce((sum, p) => sum + p.amount, 0) +
    dallasFoodPurchases.reduce((sum, p) => sum + p.amount, 0);

  console.log(`Total Dallas Spend in Logs: $${totalDallasSpend.toLocaleString()}\n`);

  // Check if Dallas items are in our database
  const allDallasSkus = new Set([
    ...uniqueDallasBev.map(p => p.sku),
    ...uniqueDallasFood.map(p => p.sku)
  ]);

  console.log(`Total Unique Dallas SKUs: ${allDallasSkus.size}\n`);

  // Check which are in database
  const { data: dbItems } = await supabase
    .from('items')
    .select('sku, name')
    .in('sku', Array.from(allDallasSkus));

  console.log(`Dallas Items in Database: ${dbItems?.length || 0}`);
  console.log(`Dallas Items NOT in Database: ${allDallasSkus.size - (dbItems?.length || 0)}\n`);

  if (dbItems && dbItems.length > 0) {
    console.log('Sample Dallas Items in Database (first 10):');
    dbItems.slice(0, 10).forEach(item => {
      console.log(`  ${item.sku} - ${item.name}`);
    });
  }
}

checkDallasPurchaseData().catch(console.error);
