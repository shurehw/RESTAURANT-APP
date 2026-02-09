/**
 * Backfill TipSee Cache
 *
 * Populates tipsee_nightly_cache with historical data.
 * Run manually after deploying the cron sync system.
 *
 * Usage:
 *   node scripts/backfill-tipsee-cache.mjs [days]
 *
 * Examples:
 *   node scripts/backfill-tipsee-cache.mjs 7    # Last 7 days
 *   node scripts/backfill-tipsee-cache.mjs 30   # Last 30 days
 *   node scripts/backfill-tipsee-cache.mjs 90   # Last 90 days
 */

import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIPSEE_CONFIG = {
  host: process.env.TIPSEE_DB_HOST || 'TIPSEE_HOST_REDACTED',
  user: process.env.TIPSEE_DB_USER,
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
};

const DAYS_TO_BACKFILL = parseInt(process.argv[2] || '7');

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log(`🚀 Starting TipSee cache backfill for last ${DAYS_TO_BACKFILL} days\n`);

  // Fetch venue mappings
  const { data: mappings, error: mappingsError } = await supabase
    .from('venue_tipsee_mappings')
    .select(`
      venue_id,
      tipsee_location_uuid,
      venues (
        id,
        name
      )
    `)
    .eq('is_active', true);

  if (mappingsError || !mappings || mappings.length === 0) {
    console.error('❌ Failed to fetch venue mappings:', mappingsError);
    process.exit(1);
  }

  const venues = mappings
    .filter((m) => m.venues && m.tipsee_location_uuid)
    .map((m) => ({
      id: m.venue_id,
      name: m.venues.name,
      tipsee_location_uuid: m.tipsee_location_uuid,
    }));

  console.log(`Found ${venues.length} venues to backfill\n`);

  // Generate date range (last N days)
  const dates = [];
  for (let i = 1; i <= DAYS_TO_BACKFILL; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }

  console.log(`Date range: ${dates[dates.length - 1]} to ${dates[0]}\n`);

  let totalSynced = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Connect to TipSee
  const tipseePool = new Pool(TIPSEE_CONFIG);

  try {
    for (const venue of venues) {
      console.log(`\n📍 ${venue.name}`);
      console.log('─'.repeat(50));

      for (const date of dates) {
        try {
          // Check if already cached
          const { data: existing } = await supabase
            .from('tipsee_nightly_cache')
            .select('business_date')
            .eq('venue_id', venue.id)
            .eq('business_date', date)
            .maybeSingle();

          if (existing) {
            console.log(`  ⏭️  ${date} - Already cached`);
            totalSkipped++;
            continue;
          }

          // Fetch from TipSee (using raw queries for backfill)
          const t0 = Date.now();
          const report = await fetchNightlyReportDirect(tipseePool, date, venue.tipsee_location_uuid);
          const queryDuration = Date.now() - t0;

          // Cache in Supabase
          const { error: upsertError } = await supabase
            .from('tipsee_nightly_cache')
            .upsert({
              venue_id: venue.id,
              business_date: date,
              location_uuid: venue.tipsee_location_uuid,
              location_name: venue.name,
              report_data: report,
              synced_at: new Date().toISOString(),
              query_duration_ms: queryDuration,
            });

          if (upsertError) {
            console.log(`  ❌ ${date} - Failed: ${upsertError.message}`);
            totalFailed++;
          } else {
            console.log(`  ✅ ${date} - Synced in ${queryDuration}ms`);
            totalSynced++;
          }
        } catch (error) {
          console.log(`  ❌ ${date} - Error: ${error.message}`);
          totalFailed++;
        }
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log('📊 Backfill Summary');
    console.log('═'.repeat(50));
    console.log(`✅ Synced:  ${totalSynced}`);
    console.log(`⏭️  Skipped: ${totalSkipped} (already cached)`);
    console.log(`❌ Failed:  ${totalFailed}`);
    console.log(`📅 Date range: ${dates[dates.length - 1]} to ${dates[0]}`);
    console.log('═'.repeat(50));
  } finally {
    await tipseePool.end();
  }
}

/**
 * Simplified fetch for backfill (returns minimal data structure)
 */
async function fetchNightlyReportDirect(pool, date, locationUuid) {
  // Run minimal queries for backfill
  const [summary, categories, servers, menuItems] = await Promise.allSettled([
    pool.query(
      `SELECT
        trading_day,
        COUNT(*) as total_checks,
        SUM(guest_count) as total_covers,
        SUM(revenue_total) as net_sales,
        SUM(sub_total) as sub_total,
        SUM(tax_total) as total_tax,
        SUM(comp_total) as total_comps,
        SUM(void_total) as total_voids
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY trading_day`,
      [locationUuid, date]
    ),
    pool.query(
      `SELECT
        COALESCE(parent_category, 'Other') as category,
        SUM(price * quantity) as gross_sales,
        SUM(comp_total) as comps,
        SUM(void_value) as voids,
        SUM(price * quantity) - SUM(COALESCE(comp_total, 0)) - SUM(COALESCE(void_value, 0)) as net_sales
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY parent_category
      ORDER BY net_sales DESC`,
      [locationUuid, date]
    ),
    pool.query(
      `SELECT
        employee_name,
        employee_role_name,
        COUNT(*) as tickets,
        SUM(guest_count) as covers,
        SUM(revenue_total) as net_sales
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY employee_name, employee_role_name
      ORDER BY net_sales DESC`,
      [locationUuid, date]
    ),
    pool.query(
      `SELECT
        name,
        SUM(quantity) as qty,
        SUM(price * quantity) as net_total
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY name
      ORDER BY net_total DESC
      LIMIT 20`,
      [locationUuid, date]
    ),
  ]);

  return {
    date,
    summary: summary.status === 'fulfilled' ? summary.value.rows[0] : {},
    salesByCategory: categories.status === 'fulfilled' ? categories.value.rows : [],
    servers: servers.status === 'fulfilled' ? servers.value.rows : [],
    menuItems: menuItems.status === 'fulfilled' ? menuItems.value.rows : [],
    detailedComps: [],
    notableGuests: [],
    peopleWeKnow: [],
    discounts: [],
  };
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
