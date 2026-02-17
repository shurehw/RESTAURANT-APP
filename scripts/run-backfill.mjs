/**
 * Standalone Backfill Script
 *
 * Run with: node scripts/run-backfill.mjs
 *
 * This script backfills venue_day_facts from TipSee data.
 * Does not depend on Next.js or complex module resolution.
 */

import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const { Pool } = pg;

// Configuration
const SUPABASE_URL = 'https://mnraeesscqsaappkaldb.supabase.co';
const SUPABASE_SERVICE_KEY = 'SUPABASE_SERVICE_ROLE_KEY_REDACTED';

const TIPSEE_CONFIG = {
  host: 'TIPSEE_HOST_REDACTED',
  port: 5432,
  user: 'TIPSEE_USERNAME_REDACTED',
  password: 'TIPSEE_PASSWORD_REDACTED',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

// Category mapping
const CATEGORY_MAPPING = {
  'Food': 'food', 'FOOD': 'food', 'Entree': 'food', 'Appetizer': 'food',
  'Dessert': 'food', 'Side': 'food', 'Salad': 'food', 'Soup': 'food',
  'Wine': 'wine', 'WINE': 'wine', 'Wine by Glass': 'wine', 'Wine by Bottle': 'wine',
  'BTG': 'wine', 'BTB': 'wine',
  'Liquor': 'liquor', 'LIQUOR': 'liquor', 'Spirits': 'liquor',
  'Cocktail': 'liquor', 'Cocktails': 'liquor',
  'Beer': 'beer', 'BEER': 'beer', 'Beers': 'beer', 'Draft': 'beer',
  'Beverage': 'beverage', 'BEVERAGE': 'beverage', 'Drinks': 'beverage',
};

function getCategoryType(category) {
  if (!category) return 'other';
  return CATEGORY_MAPPING[category] || 'other';
}

function computeHash(data) {
  const str = JSON.stringify(data, Object.keys(data).sort());
  return createHash('sha256').update(str).digest('hex').substring(0, 16);
}

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const tipseePool = new Pool(TIPSEE_CONFIG);

async function getVenueMappings() {
  const { data, error } = await supabase
    .from('venue_tipsee_mapping')
    .select('venue_id, tipsee_location_uuid, venues!inner(name)')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch venue mappings:', error);
    return [];
  }

  return (data || []).map(row => ({
    venue_id: row.venue_id,
    tipsee_location_uuid: row.tipsee_location_uuid,
    venue_name: row.venues?.name || 'Unknown',
  }));
}

async function syncVenueDay(venueId, tipseeLocationUuid, businessDate) {
  const startTime = Date.now();
  let rowsLoaded = 0;

  try {
    // 1. Extract summary from TipSee
    const summaryResult = await tipseePool.query(
      `SELECT
        trading_day,
        COUNT(*) as total_checks,
        SUM(guest_count) as total_covers,
        SUM(revenue_total) as gross_sales,
        SUM(sub_total) as net_sales,
        SUM(tax_total) as total_tax,
        SUM(comp_total) as total_comps,
        SUM(void_total) as total_voids
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY trading_day`,
      [tipseeLocationUuid, businessDate]
    );

    const summary = summaryResult.rows[0] || {
      total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0,
      total_tax: 0, total_comps: 0, total_voids: 0,
    };

    // 2. Extract category breakdown
    const categoryResult = await tipseePool.query(
      `SELECT
        COALESCE(parent_category, 'Other') as category,
        SUM(price * quantity) as gross_sales,
        SUM(quantity) as quantity_sold,
        SUM(comp_total) as comps_total,
        SUM(void_value) as voids_total
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY parent_category`,
      [tipseeLocationUuid, businessDate]
    );

    // Calculate category breakdowns
    let foodSales = 0, beverageSales = 0, wineSales = 0, liquorSales = 0, beerSales = 0, otherSales = 0;
    let totalItemsSold = 0;

    for (const row of categoryResult.rows) {
      const categoryType = getCategoryType(row.category);
      const sales = parseFloat(row.gross_sales) || 0;
      totalItemsSold += parseInt(row.quantity_sold) || 0;

      switch (categoryType) {
        case 'food': foodSales += sales; break;
        case 'wine': wineSales += sales; beverageSales += sales; break;
        case 'liquor': liquorSales += sales; beverageSales += sales; break;
        case 'beer': beerSales += sales; beverageSales += sales; break;
        case 'beverage': beverageSales += sales; break;
        default: otherSales += sales;
      }
    }

    // 3. Extract tips
    const tipsResult = await tipseePool.query(
      `SELECT COALESCE(SUM(tip_amount), 0) as tips_total
       FROM public.tipsee_payments p
       JOIN public.tipsee_checks c ON p.check_id = c.id
       WHERE c.location_uuid = $1 AND c.trading_day = $2`,
      [tipseeLocationUuid, businessDate]
    );
    const tipsTotal = parseFloat(tipsResult.rows[0]?.tips_total) || 0;

    // 4. Upsert to venue_day_facts
    const { error: upsertError } = await supabase
      .from('venue_day_facts')
      .upsert({
        venue_id: venueId,
        business_date: businessDate,
        gross_sales: parseFloat(summary.gross_sales) || 0,
        net_sales: parseFloat(summary.net_sales) || 0,
        food_sales: foodSales,
        beverage_sales: beverageSales,
        wine_sales: wineSales,
        liquor_sales: liquorSales,
        beer_sales: beerSales,
        other_sales: otherSales,
        comps_total: parseFloat(summary.total_comps) || 0,
        voids_total: parseFloat(summary.total_voids) || 0,
        taxes_total: parseFloat(summary.total_tax) || 0,
        tips_total: tipsTotal,
        checks_count: parseInt(summary.total_checks) || 0,
        covers_count: parseInt(summary.total_covers) || 0,
        items_sold: totalItemsSold,
        is_complete: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,business_date' });

    if (upsertError) {
      throw upsertError;
    }
    rowsLoaded++;

    // 5. Extract and upsert labor_day_facts
    // Primary: tipsee_7shifts_punches (most complete, hourly_wage inline in cents)
    // Fallback 1: new_tipsee_punches + wage join
    // Fallback 2: punches (old table, stale for LA)
    const laborResult = await tipseePool.query(
      `SELECT
        COUNT(*) as punch_count,
        COUNT(DISTINCT user_id) as employee_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600), 0) as total_hours,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600 *
          CASE WHEN COALESCE(hourly_wage, 0) > 100 THEN COALESCE(hourly_wage, 0) / 100.0 ELSE COALESCE(hourly_wage, 0) END
        ), 0) as labor_cost
      FROM public.tipsee_7shifts_punches
      WHERE location_uuid = $1
        AND clocked_in::date = $2::date
        AND clocked_out IS NOT NULL
        AND deleted IS NOT TRUE`,
      [tipseeLocationUuid, businessDate]
    );

    let laborRow = laborResult.rows[0];
    let laborTable = 'tipsee_7shifts_punches';

    // Fallback 1: new_tipsee_punches with wage join
    if (!laborRow || parseInt(laborRow.punch_count) === 0) {
      const fb1 = await tipseePool.query(
        `SELECT
          COUNT(*) as punch_count,
          COUNT(DISTINCT p.user_id) as employee_count,
          COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0) as total_hours,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 *
            COALESCE(w.wage_cents, 0) / 100
          ), 0) as labor_cost
        FROM public.new_tipsee_punches p
        LEFT JOIN LATERAL (
          SELECT wage_cents FROM public.new_tipsee_7shifts_users_wages
          WHERE user_id = p.user_id
            AND effective_date <= p.clocked_in::date
          ORDER BY effective_date DESC
          LIMIT 1
        ) w ON true
        WHERE p.location_uuid = $1
          AND p.clocked_in::date = $2::date
          AND p.clocked_out IS NOT NULL
          AND p.is_deleted IS NOT TRUE`,
        [tipseeLocationUuid, businessDate]
      );
      if (fb1.rows[0] && parseInt(fb1.rows[0].punch_count) > 0) {
        laborRow = fb1.rows[0];
        laborTable = 'new_tipsee_punches';
      }
    }

    // Fallback 2: old punches table
    if (!laborRow || parseInt(laborRow.punch_count) === 0) {
      const fb2 = await tipseePool.query(
        `SELECT
          COUNT(*) as punch_count,
          COUNT(DISTINCT user_id) as employee_count,
          COALESCE(SUM(total_hours), 0) as total_hours,
          COALESCE(SUM(total_hours * CASE WHEN COALESCE(hourly_wage, 0) > 100 THEN COALESCE(hourly_wage, 0) / 100.0 ELSE COALESCE(hourly_wage, 0) END), 0) as labor_cost
        FROM public.punches
        WHERE location_uuid = $1
          AND trading_day = $2
          AND deleted IS NOT TRUE
          AND clocked_out IS NOT NULL`,
        [tipseeLocationUuid, businessDate]
      );
      if (fb2.rows[0] && parseInt(fb2.rows[0].punch_count) > 0) {
        laborRow = fb2.rows[0];
        laborTable = 'punches';
      }
    }

    if (laborRow && parseInt(laborRow.punch_count) > 0) {
      // Calculate OT hours from whichever table had data
      let otHours = 0;
      if (laborTable === 'tipsee_7shifts_punches') {
        const otResult = await tipseePool.query(
          `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
          FROM public.tipsee_7shifts_punches
          WHERE location_uuid = $1
            AND clocked_in::date = $2::date
            AND clocked_out IS NOT NULL
            AND deleted IS NOT TRUE
          GROUP BY user_id
          HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`,
          [tipseeLocationUuid, businessDate]
        );
        otHours = otResult.rows.reduce((sum, r) => sum + Math.max(0, parseFloat(r.daily_hours) - 8), 0);
      } else if (laborTable === 'new_tipsee_punches') {
        const otResult = await tipseePool.query(
          `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
          FROM public.new_tipsee_punches
          WHERE location_uuid = $1
            AND clocked_in::date = $2::date
            AND clocked_out IS NOT NULL
            AND is_deleted IS NOT TRUE
          GROUP BY user_id
          HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`,
          [tipseeLocationUuid, businessDate]
        );
        otHours = otResult.rows.reduce((sum, r) => sum + Math.max(0, parseFloat(r.daily_hours) - 8), 0);
      }

      // FOH/BOH breakdown (only from tipsee_7shifts_punches)
      let fohHours = 0, fohCost = 0, fohEmpCount = 0;
      let bohHours = 0, bohCost = 0, bohEmpCount = 0;
      let otherHours = 0, otherCost = 0, otherEmpCount = 0;

      if (laborTable === 'tipsee_7shifts_punches') {
        const deptResult = await tipseePool.query(
          `SELECT
            CASE WHEN d.name = 'FOH' THEN 'FOH' WHEN d.name = 'BOH' THEN 'BOH' ELSE 'Other' END as dept_group,
            COUNT(DISTINCT p.user_id) as employee_count,
            COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0) as total_hours,
            COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 * CASE WHEN COALESCE(p.hourly_wage, 0) > 100 THEN COALESCE(p.hourly_wage, 0) / 100.0 ELSE COALESCE(p.hourly_wage, 0) END), 0) as labor_cost
          FROM public.tipsee_7shifts_punches p
          LEFT JOIN (SELECT DISTINCT ON (id) id, name FROM public.departments) d ON d.id = p.department_id
          WHERE p.location_uuid = $1 AND p.clocked_in::date = $2::date
            AND p.clocked_out IS NOT NULL AND p.deleted IS NOT TRUE
          GROUP BY dept_group`,
          [tipseeLocationUuid, businessDate]
        );
        for (const r of deptResult.rows) {
          if (r.dept_group === 'FOH') { fohHours = parseFloat(r.total_hours) || 0; fohCost = parseFloat(r.labor_cost) || 0; fohEmpCount = parseInt(r.employee_count) || 0; }
          else if (r.dept_group === 'BOH') { bohHours = parseFloat(r.total_hours) || 0; bohCost = parseFloat(r.labor_cost) || 0; bohEmpCount = parseInt(r.employee_count) || 0; }
          else { otherHours = parseFloat(r.total_hours) || 0; otherCost = parseFloat(r.labor_cost) || 0; otherEmpCount = parseInt(r.employee_count) || 0; }
        }
      }

      const { error: laborError } = await supabase.from('labor_day_facts').upsert({
        venue_id: venueId,
        business_date: businessDate,
        total_hours: parseFloat(laborRow.total_hours) || 0,
        ot_hours: otHours,
        labor_cost: parseFloat(laborRow.labor_cost) || 0,
        punch_count: parseInt(laborRow.punch_count) || 0,
        employee_count: parseInt(laborRow.employee_count) || 0,
        net_sales: parseFloat(summary.net_sales) || 0,
        covers: parseInt(summary.total_covers) || 0,
        foh_hours: fohHours,
        foh_cost: fohCost,
        foh_employee_count: fohEmpCount,
        boh_hours: bohHours,
        boh_cost: bohCost,
        boh_employee_count: bohEmpCount,
        other_hours: otherHours,
        other_cost: otherCost,
        other_employee_count: otherEmpCount,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,business_date' });
      if (laborError) {
        console.log(`\n⚠ Labor upsert error for ${businessDate}: ${laborError.message}`);
      } else {
        rowsLoaded++;
      }
    }

    return {
      success: true,
      venue_id: venueId,
      business_date: businessDate,
      rows_loaded: rowsLoaded,
      duration_ms: Date.now() - startTime,
      net_sales: parseFloat(summary.net_sales) || 0,
    };

  } catch (error) {
    return {
      success: false,
      venue_id: venueId,
      business_date: businessDate,
      rows_loaded: rowsLoaded,
      duration_ms: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function backfill(startDate, endDate) {
  console.log('='.repeat(60));
  console.log('Fact Table Backfill');
  console.log('='.repeat(60));
  console.log(`Date Range: ${startDate} → ${endDate}`);

  const mappings = await getVenueMappings();
  if (mappings.length === 0) {
    console.error('No venue mappings found!');
    process.exit(1);
  }

  console.log(`Venues: ${mappings.map(v => v.venue_name).join(', ')}`);

  // Calculate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  const totalSyncs = totalDays * mappings.length;

  console.log(`Total days: ${totalDays}`);
  console.log(`Total syncs: ${totalSyncs}`);
  console.log('='.repeat(60));
  console.log('');

  let successful = 0;
  let failed = 0;
  let currentSync = 0;

  const overallStart = Date.now();

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    for (const mapping of mappings) {
      currentSync++;
      const result = await syncVenueDay(
        mapping.venue_id,
        mapping.tipsee_location_uuid,
        dateStr
      );

      if (result.success) {
        successful++;
        const pct = ((currentSync / totalSyncs) * 100).toFixed(1);
        const salesStr = result.net_sales > 0 ? ` $${result.net_sales.toLocaleString()}` : '';
        process.stdout.write(`\r[${pct}%] ${mapping.venue_name} ${dateStr}${salesStr}                    `);
      } else {
        failed++;
        console.log(`\n✗ ${mapping.venue_name} ${dateStr}: ${result.error}`);
      }
    }
  }

  const duration = ((Date.now() - overallStart) / 1000).toFixed(1);

  console.log('\n');
  console.log('='.repeat(60));
  console.log('Backfill Complete');
  console.log('='.repeat(60));
  console.log(`Total syncs: ${successful + failed}`);
  console.log(`Successful:  ${successful}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Duration:    ${duration}s`);
  console.log(`Rate:        ${((successful + failed) / parseFloat(duration)).toFixed(1)} syncs/sec`);

  await tipseePool.end();
  process.exit(failed > 0 ? 1 : 0);
}

// Parse args and run
const args = process.argv.slice(2);
let startDate = '2025-12-29'; // FY2026 start
let endDate = new Date();
endDate.setDate(endDate.getDate() - 1);
endDate = endDate.toISOString().split('T')[0];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start') startDate = args[++i];
  if (args[i] === '--end') endDate = args[++i];
}

backfill(startDate, endDate);
