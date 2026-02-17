/**
 * Backfill venue_day_facts for SDLY (Same Day Last Year)
 *
 * Older TipSee data has location_uuid = NULL, so the main ETL sync fails.
 * This script queries by location name (text) instead, and populates
 * just the venue_day_facts summary needed for SDLY comparisons.
 *
 * Usage:
 *   npx tsx scripts/backfill-sdly.ts
 *   npx tsx scripts/backfill-sdly.ts --start 2024-01-01 --end 2025-12-31
 */

import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local', override: true });

import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const pool = new Pool({
  host: process.env.TIPSEE_DB_HOST || 'TIPSEE_HOST_REDACTED',
  user: process.env.TIPSEE_DB_USER || 'TIPSEE_USERNAME_REDACTED',
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD || 'TIPSEE_PASSWORD_REDACTED',
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 20000,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Beverage classification (matches lib/database/tipsee.ts)
function isBeverage(category: string): 'food' | 'wine' | 'liquor' | 'beer' | 'beverage' | 'other' {
  const c = (category || '').toLowerCase();
  if (c.includes('wine')) return 'wine';
  if (c.includes('liquor') || c.includes('spirit') || c.includes('cocktail')) return 'liquor';
  if (c.includes('beer') || c.includes('draft')) return 'beer';
  if (c.includes('bev') || c.includes('drink') || c.includes('bar') || c.includes('n/a')) return 'beverage';
  if (c.includes('food') || c.includes('entree') || c.includes('appetizer') || c.includes('dessert') ||
      c.includes('salad') || c.includes('soup') || c.includes('side') || c.includes('breakfast') ||
      c.includes('lunch') || c.includes('dinner') || c.includes('brunch') || c.includes('steak') ||
      c.includes('seafood') || c.includes('sushi') || c.includes('pizza') || c.includes('burger') ||
      c.includes('sandwich') || c.includes('taco') || c.includes('pasta')) return 'food';
  return 'other';
}

async function main() {
  const args = process.argv.slice(2);
  let startDate = '2024-01-01';
  let endDate = '2026-02-15';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start') startDate = args[++i];
    if (args[i] === '--end') endDate = args[++i];
  }

  console.log('='.repeat(60));
  console.log('SDLY Backfill — venue_day_facts from TipSee');
  console.log('='.repeat(60));
  console.log(`Date range: ${startDate} → ${endDate}`);

  // 1. Get venue mappings with location names
  const { data: mappings } = await supabase
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid, tipsee_location_name, venues(name)')
    .eq('is_active', true);

  if (!mappings?.length) {
    console.error('No venue mappings found');
    process.exit(1);
  }

  // Build location_name → venue_id map (for old data without UUID)
  // Also build uuid → venue_id map (for new data)
  const nameToVenue = new Map<string, { venue_id: string; name: string }>();
  const uuidToVenue = new Map<string, { venue_id: string; name: string }>();

  for (const m of mappings) {
    const venueName = (m as any).venues?.name || m.tipsee_location_name || 'Unknown';
    if (m.tipsee_location_name) {
      nameToVenue.set(m.tipsee_location_name, { venue_id: m.venue_id, name: venueName });
    }
    if (m.tipsee_location_uuid) {
      uuidToVenue.set(m.tipsee_location_uuid, { venue_id: m.venue_id, name: venueName });
    }
  }

  console.log(`Venues: ${[...nameToVenue.entries()].map(([k, v]) => k).join(', ')}`);

  // 2. Query TipSee for all data in range, grouped by location + trading_day
  console.log('\nQuerying TipSee checks...');
  const checksResult = await pool.query(
    `SELECT
      location,
      location_uuid,
      trading_day,
      COUNT(*) as total_checks,
      SUM(guest_count) as total_covers,
      SUM(revenue_total) as gross_sales,
      SUM(sub_total) as net_sales,
      SUM(tax_total) as total_tax,
      SUM(comp_total) as total_comps,
      SUM(void_total) as total_voids
    FROM public.tipsee_checks
    WHERE trading_day >= $1 AND trading_day <= $2
    GROUP BY location, location_uuid, trading_day
    ORDER BY trading_day, location`,
    [startDate, endDate]
  );
  console.log(`Got ${checksResult.rowCount} location-day summaries`);

  // 3. Query category breakdown
  console.log('Querying TipSee check items...');
  const itemsResult = await pool.query(
    `SELECT
      location,
      location_uuid,
      trading_day,
      COALESCE(parent_category, 'Other') as category,
      SUM(price * quantity) as sales,
      SUM(quantity) as quantity_sold
    FROM public.tipsee_check_items
    WHERE trading_day >= $1 AND trading_day <= $2
    GROUP BY location, location_uuid, trading_day, parent_category`,
    [startDate, endDate]
  );
  console.log(`Got ${itemsResult.rowCount} category breakdowns`);

  // Build category lookup: "location|date" -> categories
  const categoryMap = new Map<string, { food: number; bev: number; wine: number; liquor: number; beer: number; other: number; items: number }>();
  for (const row of itemsResult.rows) {
    const dateStr = new Date(row.trading_day).toISOString().split('T')[0];
    const loc = row.location || row.location_uuid || 'unknown';
    const key = `${loc}|${dateStr}`;
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { food: 0, bev: 0, wine: 0, liquor: 0, beer: 0, other: 0, items: 0 });
    }
    const c = categoryMap.get(key)!;
    const sales = parseFloat(row.sales) || 0;
    const qty = parseInt(row.quantity_sold) || 0;
    c.items += qty;

    const type = isBeverage(row.category);
    switch (type) {
      case 'food': c.food += sales; break;
      case 'wine': c.wine += sales; c.bev += sales; break;
      case 'liquor': c.liquor += sales; c.bev += sales; break;
      case 'beer': c.beer += sales; c.bev += sales; break;
      case 'beverage': c.bev += sales; break;
      default: c.other += sales;
    }
  }

  // 4. Match to venues and upsert
  let upserted = 0;
  let skipped = 0;
  const batch: any[] = [];

  for (const row of checksResult.rows) {
    // Resolve venue_id: try UUID first, fall back to location name
    let venue = row.location_uuid ? uuidToVenue.get(row.location_uuid) : undefined;
    if (!venue && row.location) {
      venue = nameToVenue.get(row.location);
    }
    if (!venue) {
      skipped++;
      continue;
    }

    const dateStr = new Date(row.trading_day).toISOString().split('T')[0];
    const loc = row.location || row.location_uuid || 'unknown';
    const cats = categoryMap.get(`${loc}|${dateStr}`) || { food: 0, bev: 0, wine: 0, liquor: 0, beer: 0, other: 0, items: 0 };

    batch.push({
      venue_id: venue.venue_id,
      business_date: dateStr,
      gross_sales: parseFloat(row.gross_sales) || 0,
      net_sales: parseFloat(row.net_sales) || 0,
      food_sales: cats.food,
      beverage_sales: cats.bev,
      wine_sales: cats.wine,
      liquor_sales: cats.liquor,
      beer_sales: cats.beer,
      other_sales: cats.other,
      comps_total: parseFloat(row.total_comps) || 0,
      voids_total: parseFloat(row.total_voids) || 0,
      taxes_total: parseFloat(row.total_tax) || 0,
      checks_count: parseInt(row.total_checks) || 0,
      covers_count: parseInt(row.total_covers) || 0,
      items_sold: cats.items,
      is_complete: true,
      last_synced_at: new Date().toISOString(),
    });

    // Upsert in batches of 100
    if (batch.length >= 100) {
      const { error } = await supabase
        .from('venue_day_facts')
        .upsert(batch, { onConflict: 'venue_id,business_date' });
      if (error) console.error('Upsert error:', error.message);
      upserted += batch.length;
      process.stdout.write(`\r  Upserted ${upserted} rows...`);
      batch.length = 0;
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const { error } = await supabase
      .from('venue_day_facts')
      .upsert(batch, { onConflict: 'venue_id,business_date' });
    if (error) console.error('Upsert error:', error.message);
    upserted += batch.length;
  }

  console.log(`\n\nDone!`);
  console.log(`  Upserted: ${upserted} venue-day rows`);
  console.log(`  Skipped:  ${skipped} (unmapped locations)`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
