/**
 * Backfill sales_snapshots with hourly cumulative totals from TipSee.
 * Creates one snapshot per hour during service so the Revenue Over Service
 * chart works for historical dates, not just live polling days.
 *
 * Two data sources:
 *   - tipsee_checks / tipsee_check_items (May 2025+, keyed by location_uuid)
 *   - checks / check_items (legacy, Jan 2020–May 2025, keyed by location name)
 *
 * The script automatically falls back to the legacy tables when tipsee_checks
 * has no data for a given venue+date.
 *
 * Usage:
 *   node scripts/backfill-snapshots.mjs                   # yesterday
 *   node scripts/backfill-snapshots.mjs 2026-02-10        # single date
 *   node scripts/backfill-snapshots.mjs 2026-02-01 2026-02-14  # date range
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

config({ path: '.env.local' });

// Parse date args
const args = process.argv.slice(2);
let startDate, endDate;
if (args.length === 0) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  startDate = endDate = yesterday.toISOString().split('T')[0];
} else if (args.length === 1) {
  startDate = endDate = args[0];
} else {
  startDate = args[0];
  endDate = args[1];
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tipseePool = new pg.Pool({
  host: 'TIPSEE_HOST_REDACTED',
  user: 'TIPSEE_USERNAME_REDACTED',
  password: 'TIPSEE_PASSWORD_REDACTED',
  database: 'postgres',
  port: 5432,
  ssl: { rejectUnauthorized: false },
});

// Generate array of dates from start to end
function getDateRange(start, end) {
  const dates = [];
  const d = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  while (d <= e) {
    dates.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

try {
  // 1. Get all active venue mappings
  const { data: mappings } = await sb
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid, is_active')
    .eq('is_active', true);

  const { data: venues } = await sb
    .from('venues')
    .select('id, name')
    .eq('is_active', true);

  const nameMap = {};
  venues?.forEach(v => { nameMap[v.id] = v.name; });

  // Group locations by venue
  const venueToLocs = {};
  mappings?.forEach(m => {
    if (!venueToLocs[m.venue_id]) venueToLocs[m.venue_id] = [];
    venueToLocs[m.venue_id].push(m.tipsee_location_uuid);
  });

  // Detect POS type per venue (cache it)
  const posTypeCache = {};
  for (const [venueId, locationUuids] of Object.entries(venueToLocs)) {
    const posResult = await tipseePool.query(
      `SELECT pos_type FROM public.general_locations WHERE uuid = ANY($1::uuid[]) AND pos_type IS NOT NULL LIMIT 1`,
      [locationUuids]
    );
    const pt = posResult.rows[0]?.pos_type;
    posTypeCache[venueId] = pt === 'simphony' ? 'simphony' : pt === 'avero' ? 'avero' : 'upserve';
  }

  // Build venue name → legacy location name mapping for the legacy `checks` table.
  // Legacy table uses text location names instead of UUIDs.
  const LEGACY_NAME_MAP = {
    'Nice Guy LA': 'The Nice Guy',
  };
  const venueIdToLegacyName = {};
  for (const [venueId] of Object.entries(venueToLocs)) {
    const venueName = nameMap[venueId];
    venueIdToLegacyName[venueId] = LEGACY_NAME_MAP[venueName] || venueName;
  }

  const dates = getDateRange(startDate, endDate);
  console.log(`\nBackfilling ${dates.length} day(s): ${startDate} to ${endDate}`);
  console.log(`Venues: ${Object.keys(venueToLocs).length}\n`);

  let totalSnapshots = 0;

  for (const DATE of dates) {
    console.log(`── ${DATE} ──`);

    for (const [venueId, locationUuids] of Object.entries(venueToLocs)) {
      const venueName = nameMap[venueId] || venueId.slice(0, 8);
      const posType = posTypeCache[venueId];

      // Delete existing snapshots for this venue+date
      const { error: delError } = await sb
        .from('sales_snapshots')
        .delete()
        .eq('venue_id', venueId)
        .eq('business_date', DATE);

      if (delError) {
        console.error(`  ${venueName}: Delete error: ${delError.message}`);
        continue;
      }

      if (posType === 'simphony') {
        // Simphony: no hourly data available, insert single EOD snapshot
        const result = await tipseePool.query(
          `SELECT
            COALESCE(SUM(check_count), 0) as total_checks,
            COALESCE(SUM(guest_count), 0) as total_covers,
            COALESCE(SUM(gross_sales), 0) as gross_sales,
            COALESCE(SUM(net_sales), 0) as net_sales,
            COALESCE(SUM(discount_total), 0) as comps_total,
            COALESCE(SUM(void_total), 0) as voids_total,
            COALESCE(SUM(CASE
              WHEN LOWER(COALESCE(revenue_center_name, '')) LIKE '%bar%'
                OR (revenue_center_name IS NULL AND revenue_center_number = 2)
              THEN net_sales ELSE 0 END), 0) as beverage_sales,
            COALESCE(SUM(CASE
              WHEN LOWER(COALESCE(revenue_center_name, '')) NOT LIKE '%bar%'
                AND NOT (revenue_center_name IS NULL AND revenue_center_number = 2)
              THEN net_sales ELSE 0 END), 0) as food_sales
          FROM public.tipsee_simphony_sales
          WHERE location_uuid = ANY($1) AND trading_day = $2`,
          [locationUuids, DATE]
        );
        const d = result.rows[0];
        const net = parseFloat(d.net_sales);
        if (net === 0 && parseInt(d.total_checks) === 0) {
          console.log(`  ${venueName} (simphony): No data, skipping`);
          continue;
        }
        const { error } = await sb.from('sales_snapshots').upsert({
          venue_id: venueId,
          business_date: DATE,
          snapshot_at: `${DATE}T23:59:00-08:00`,
          gross_sales: parseFloat(d.gross_sales),
          net_sales: net,
          food_sales: parseFloat(d.food_sales),
          beverage_sales: parseFloat(d.beverage_sales),
          checks_count: parseInt(d.total_checks),
          covers_count: parseInt(d.total_covers),
          comps_total: parseFloat(d.comps_total),
          voids_total: parseFloat(d.voids_total),
        }, { onConflict: 'venue_id,business_date,snapshot_at' });
        if (error) console.error(`  ${venueName}: Insert error: ${error.message}`);
        else {
          console.log(`  ${venueName} (simphony): 1 EOD snapshot, net=$${net.toFixed(0)}`);
          totalSnapshots += 1;
        }
        continue;
      }

      if (posType === 'avero') {
        // Avero: daily aggregates only — single EOD snapshot (like Simphony)
        const [salesResult, logResult] = await Promise.all([
          tipseePool.query(
            `SELECT
              COALESCE(SUM(net_sales), 0) as net_sales,
              COALESCE(SUM(cover_count), 0) as total_covers
            FROM public.new_tipsee_avero_sales
            WHERE location_uuid = ANY($1) AND date = $2 AND is_deleted IS NOT TRUE`,
            [locationUuids, DATE]
          ),
          tipseePool.query(
            `SELECT
              COALESCE(SUM(gross_sales), 0) as gross_sales,
              COALESCE(SUM(comp), 0) as total_comps
            FROM public.avero_log
            WHERE location_uuid = ANY($1) AND date = $2`,
            [locationUuids, DATE]
          ),
        ]);
        const s = salesResult.rows[0];
        const l = logResult.rows[0];
        const net = parseFloat(s.net_sales);
        const covers = parseInt(s.total_covers);
        const gross = parseFloat(l.gross_sales) || net;
        const comps = parseFloat(l.total_comps);
        if (net === 0 && covers === 0) {
          console.log(`  ${venueName} (avero): No data, skipping`);
          continue;
        }
        const { error } = await sb.from('sales_snapshots').upsert({
          venue_id: venueId,
          business_date: DATE,
          snapshot_at: `${DATE}T23:59:00-08:00`,
          gross_sales: gross,
          net_sales: net,
          food_sales: 0,
          beverage_sales: 0,
          checks_count: 0,
          covers_count: covers,
          comps_total: comps,
          voids_total: 0,
        }, { onConflict: 'venue_id,business_date,snapshot_at' });
        if (error) console.error(`  ${venueName}: Insert error: ${error.message}`);
        else {
          console.log(`  ${venueName} (avero): 1 EOD snapshot, net=$${net.toFixed(0)}`);
          totalSnapshots += 1;
        }
        continue;
      }

      // ── Upserve: hourly cumulative snapshots ──

      // Get hourly breakdown from closed checks (try tipsee_checks first)
      let hourlyChecks, hourlyItems;
      let dataSource = 'tipsee';

      [hourlyChecks, hourlyItems] = await Promise.all([
        tipseePool.query(
          `SELECT
            EXTRACT(HOUR FROM close_time) as hr,
            COUNT(*) as checks,
            COALESCE(SUM(guest_count), 0) as covers,
            COALESCE(SUM(sub_total), 0) as gross,
            COALESCE(SUM(revenue_total), 0) as net,
            COALESCE(SUM(comp_total), 0) as comps,
            COALESCE(SUM(void_total), 0) as voids
          FROM public.tipsee_checks
          WHERE location_uuid = ANY($1)
            AND trading_day = $2
            AND close_time IS NOT NULL
          GROUP BY EXTRACT(HOUR FROM close_time)
          ORDER BY hr`,
          [locationUuids, DATE]
        ),
        tipseePool.query(
          `SELECT
            EXTRACT(HOUR FROM c.close_time) as hr,
            CASE
              WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
              THEN 'bev'
              ELSE 'food'
            END as sales_type,
            COALESCE(SUM(ci.price * ci.quantity), 0) as total
          FROM public.tipsee_check_items ci
          JOIN public.tipsee_checks c ON ci.check_id = c.id
          WHERE c.location_uuid = ANY($1)
            AND c.trading_day = $2
            AND c.close_time IS NOT NULL
          GROUP BY hr, sales_type
          ORDER BY hr`,
          [locationUuids, DATE]
        ),
      ]);

      // Fallback 1: tipsee_checks without close_time filter (use open_time)
      if (hourlyChecks.rows.length === 0) {
        const fallbackResult = await tipseePool.query(
          `SELECT COUNT(*) as total_checks, COALESCE(SUM(revenue_total), 0) as net
          FROM public.tipsee_checks
          WHERE location_uuid = ANY($1) AND trading_day = $2`,
          [locationUuids, DATE]
        );
        const net = parseFloat(fallbackResult.rows[0]?.net || 0);
        if (net > 0) {
          const [hourlyOpenChecks, hourlyOpenItems] = await Promise.all([
            tipseePool.query(
              `SELECT
                EXTRACT(HOUR FROM open_time) as hr,
                COUNT(*) as checks,
                COALESCE(SUM(guest_count), 0) as covers,
                COALESCE(SUM(sub_total), 0) as gross,
                COALESCE(SUM(revenue_total), 0) as net,
                COALESCE(SUM(comp_total), 0) as comps,
                COALESCE(SUM(void_total), 0) as voids
              FROM public.tipsee_checks
              WHERE location_uuid = ANY($1) AND trading_day = $2
              GROUP BY EXTRACT(HOUR FROM open_time)
              ORDER BY hr`,
              [locationUuids, DATE]
            ),
            tipseePool.query(
              `SELECT
                EXTRACT(HOUR FROM c.open_time) as hr,
                CASE
                  WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
                  THEN 'bev'
                  ELSE 'food'
                END as sales_type,
                COALESCE(SUM(ci.price * ci.quantity), 0) as total
              FROM public.tipsee_check_items ci
              JOIN public.tipsee_checks c ON ci.check_id = c.id
              WHERE c.location_uuid = ANY($1) AND c.trading_day = $2
              GROUP BY hr, sales_type
              ORDER BY hr`,
              [locationUuids, DATE]
            ),
          ]);
          hourlyChecks.rows = hourlyOpenChecks.rows;
          hourlyItems.rows = hourlyOpenItems.rows;
        }
      }

      // Fallback 2: legacy `checks` + `check_items` tables (pre-May 2025 data)
      if (hourlyChecks.rows.length === 0) {
        const legacyName = venueIdToLegacyName[venueId];
        const [legacyChecks, legacyItems] = await Promise.all([
          tipseePool.query(
            `SELECT
              EXTRACT(HOUR FROM close_time) as hr,
              COUNT(*) as checks,
              COALESCE(SUM(guest_count), 0) as covers,
              COALESCE(SUM(sub_total), 0) as gross,
              COALESCE(SUM(revenue_total), 0) as net,
              COALESCE(SUM(comp_total), 0) as comps,
              COALESCE(SUM(void_total), 0) as voids
            FROM public.checks
            WHERE location = $1
              AND trading_day = $2
              AND close_time IS NOT NULL
            GROUP BY EXTRACT(HOUR FROM close_time)
            ORDER BY hr`,
            [legacyName, DATE]
          ),
          tipseePool.query(
            `SELECT
              EXTRACT(HOUR FROM c.close_time) as hr,
              CASE
                WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
                  OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
                  OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
                  OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
                  OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
                THEN 'bev'
                ELSE 'food'
              END as sales_type,
              COALESCE(SUM(ci.price * ci.quantity), 0) as total
            FROM public.check_items ci
            JOIN public.checks c ON ci.check_id = c.id
            WHERE c.location = $1
              AND c.trading_day = $2
              AND c.close_time IS NOT NULL
            GROUP BY hr, sales_type
            ORDER BY hr`,
            [legacyName, DATE]
          ),
        ]);
        if (legacyChecks.rows.length > 0) {
          hourlyChecks.rows = legacyChecks.rows;
          hourlyItems.rows = legacyItems.rows;
          dataSource = 'legacy';
        }
      }

      if (hourlyChecks.rows.length === 0) {
        console.log(`  ${venueName} (upserve): No data, skipping`);
        continue;
      }

      // Build hourly food/bev lookup
      const hourlyFoodBev = {};
      for (const row of hourlyItems.rows) {
        const hr = parseInt(row.hr);
        if (!hourlyFoodBev[hr]) hourlyFoodBev[hr] = { food: 0, bev: 0 };
        if (row.sales_type === 'bev') hourlyFoodBev[hr].bev += parseFloat(row.total);
        else hourlyFoodBev[hr].food += parseFloat(row.total);
      }

      // Build cumulative snapshots
      // Sort hours in service order: afternoon hours (11-23) first, then late night (0-4)
      const rawHours = hourlyChecks.rows.map(r => parseInt(r.hr));
      const sortedRows = [...hourlyChecks.rows].sort((a, b) => {
        const ha = parseInt(a.hr);
        const hb = parseInt(b.hr);
        const oa = ha < 5 ? ha + 24 : ha; // 0-4 AM → 24-28
        const ob = hb < 5 ? hb + 24 : hb;
        return oa - ob;
      });

      let cumChecks = 0, cumCovers = 0, cumGross = 0, cumNet = 0;
      let cumComps = 0, cumVoids = 0, cumFood = 0, cumBev = 0;
      const snapshots = [];

      for (const row of sortedRows) {
        const hr = parseInt(row.hr);
        cumChecks += parseInt(row.checks);
        cumCovers += parseInt(row.covers);
        cumGross += parseFloat(row.gross);
        cumNet += parseFloat(row.net);
        cumComps += parseFloat(row.comps);
        cumVoids += parseFloat(row.voids);
        cumFood += hourlyFoodBev[hr]?.food || 0;
        cumBev += hourlyFoodBev[hr]?.bev || 0;

        // Create snapshot at the end of this hour
        // For late-night hours (0-4), use the next calendar day in the timestamp
        // but keep the business_date as DATE
        const snapshotHour = hr;
        const snapshotDate = hr < 5 ? shiftDateStr(DATE, 1) : DATE;
        const timeStr = `${String(snapshotHour).padStart(2, '0')}:59:00`;
        const snapshotAt = `${snapshotDate}T${timeStr}-08:00`; // Pacific

        snapshots.push({
          venue_id: venueId,
          business_date: DATE,
          snapshot_at: snapshotAt,
          gross_sales: cumGross,
          net_sales: cumNet,
          food_sales: cumFood,
          beverage_sales: cumBev,
          checks_count: cumChecks,
          covers_count: cumCovers,
          comps_total: cumComps,
          voids_total: cumVoids,
        });
      }

      if (snapshots.length === 0) {
        console.log(`  ${venueName} (upserve): No data, skipping`);
        continue;
      }

      // Batch insert
      const { error: insError } = await sb
        .from('sales_snapshots')
        .upsert(snapshots, { onConflict: 'venue_id,business_date,snapshot_at' });

      if (insError) {
        console.error(`  ${venueName}: Insert error: ${insError.message}`);
      } else {
        const finalNet = snapshots[snapshots.length - 1].net_sales;
        const src = dataSource === 'legacy' ? 'legacy' : 'upserve';
        console.log(`  ${venueName} (${src}): ${snapshots.length} hourly snapshots, net=$${finalNet.toFixed(0)}`);
        totalSnapshots += snapshots.length;
      }
    }
    console.log('');
  }

  console.log(`Backfill complete! ${totalSnapshots} snapshots created.\n`);

} catch (e) {
  console.error('Error:', e.message);
  console.error(e.stack);
}

await tipseePool.end();

function shiftDateStr(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}
