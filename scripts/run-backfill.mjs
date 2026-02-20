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
import { SUPABASE_URL, SUPABASE_SERVICE_KEY, TIPSEE_CONFIG } from './_config.mjs';

const { Pool } = pg;

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

// Detect POS type from general_locations
async function getPosType(locationUuid) {
  if (!locationUuid) return 'upserve';
  try {
    const result = await tipseePool.query(
      `SELECT pos_type FROM public.general_locations WHERE uuid = $1 AND pos_type IS NOT NULL LIMIT 1`,
      [locationUuid]
    );
    const posType = result.rows[0]?.pos_type;
    if (posType === 'simphony') return 'simphony';
    if (posType === 'avero') return 'avero';
    return 'upserve';
  } catch {
    return 'upserve';
  }
}

// Simphony venue sync (tipsee_simphony_sales table)
async function syncVenueDaySimphony(venueId, tipseeLocationUuid, businessDate) {
  const startTime = Date.now();
  let rowsLoaded = 0;

  try {
    const result = await tipseePool.query(
      `SELECT
        COALESCE(SUM(check_count), 0) as total_checks,
        COALESCE(SUM(guest_count), 0) as total_covers,
        COALESCE(SUM(gross_sales), 0) as gross_sales,
        COALESCE(SUM(net_sales), 0) as net_sales,
        COALESCE(SUM(tax_total), 0) as total_tax,
        ABS(COALESCE(SUM(discount_total), 0)) as total_comps,
        ABS(COALESCE(SUM(void_total), 0)) as total_voids,
        COALESCE(SUM(CASE
          WHEN LOWER(COALESCE(revenue_center_name, '')) LIKE '%bar%'
            OR (revenue_center_name IS NULL AND revenue_center_number = 2)
          THEN net_sales ELSE 0 END), 0) as beverage_sales,
        COALESCE(SUM(CASE
          WHEN LOWER(COALESCE(revenue_center_name, '')) NOT LIKE '%bar%'
            AND NOT (revenue_center_name IS NULL AND revenue_center_number = 2)
          THEN net_sales ELSE 0 END), 0) as food_sales
      FROM public.tipsee_simphony_sales
      WHERE location_uuid = $1 AND trading_day = $2`,
      [tipseeLocationUuid, businessDate]
    );

    const row = result.rows[0];
    if (!row || (parseFloat(row.net_sales) === 0 && parseInt(row.total_checks) === 0)) {
      return { success: true, rowsLoaded: 0, net_sales: 0, duration: Date.now() - startTime };
    }

    // Upsert venue_day_facts
    const { error: upsertError } = await supabase
      .from('venue_day_facts')
      .upsert({
        venue_id: venueId,
        business_date: businessDate,
        gross_sales: parseFloat(row.gross_sales) || 0,
        net_sales: parseFloat(row.net_sales) || 0,
        food_sales: parseFloat(row.food_sales) || 0,
        beverage_sales: parseFloat(row.beverage_sales) || 0,
        wine_sales: 0,
        liquor_sales: 0,
        beer_sales: 0,
        other_sales: 0,
        comps_total: parseFloat(row.total_comps) || 0,
        voids_total: parseFloat(row.total_voids) || 0,
        taxes_total: parseFloat(row.total_tax) || 0,
        tips_total: 0,
        checks_count: parseInt(row.total_checks) || 0,
        covers_count: parseInt(row.total_covers) || 0,
        items_sold: 0,
        is_complete: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,business_date' });

    if (upsertError) throw upsertError;
    rowsLoaded++;

    const netSales = parseFloat(row.net_sales) || 0;
    const covers = parseInt(row.total_covers) || 0;

    // Labor (same logic as Upserve — 7shifts punches are POS-independent)
    await syncLaborForVenue(venueId, tipseeLocationUuid, businessDate, netSales, covers);
    rowsLoaded++;

    return { success: true, rowsLoaded, net_sales: netSales, duration: Date.now() - startTime };
  } catch (error) {
    return { success: false, error: error.message, rowsLoaded: 0, net_sales: 0, duration: Date.now() - startTime };
  }
}

// Avero venue sync (new_tipsee_avero_sales + avero_log tables)
async function syncVenueDayAvero(venueId, tipseeLocationUuid, businessDate) {
  const startTime = Date.now();
  let rowsLoaded = 0;

  try {
    // 1. Sales data from new_tipsee_avero_sales
    const salesResult = await tipseePool.query(
      `SELECT
        COALESCE(SUM(net_sales), 0) as net_sales,
        COALESCE(SUM(cover_count), 0) as total_covers
      FROM public.new_tipsee_avero_sales
      WHERE location_uuid = $1 AND date = $2 AND is_deleted IS NOT TRUE`,
      [tipseeLocationUuid, businessDate]
    );

    // 2. Comp + gross data from avero_log
    const logResult = await tipseePool.query(
      `SELECT
        COALESCE(SUM(gross_sales), 0) as gross_sales,
        COALESCE(SUM(comp), 0) as total_comps
      FROM public.avero_log
      WHERE location_uuid = $1 AND date = $2`,
      [tipseeLocationUuid, businessDate]
    );

    const sales = salesResult.rows[0];
    const log = logResult.rows[0];

    const netSales = parseFloat(sales?.net_sales) || 0;
    const covers = parseInt(sales?.total_covers) || 0;
    const grossSales = parseFloat(log?.gross_sales) || 0;
    const comps = parseFloat(log?.total_comps) || 0;

    if (netSales === 0 && covers === 0) {
      return { success: true, rowsLoaded: 0, net_sales: 0, duration: Date.now() - startTime };
    }

    // 3. Upsert venue_day_facts
    // Avero has no food/bev split, no checks, no voids, no tips
    const { error: upsertError } = await supabase
      .from('venue_day_facts')
      .upsert({
        venue_id: venueId,
        business_date: businessDate,
        gross_sales: grossSales || netSales, // fall back to net if avero_log has no data
        net_sales: netSales,
        food_sales: 0,
        beverage_sales: 0,
        wine_sales: 0,
        liquor_sales: 0,
        beer_sales: 0,
        other_sales: 0,
        comps_total: comps,
        voids_total: 0,
        taxes_total: 0,
        tips_total: 0,
        checks_count: 0, // Avero doesn't provide check count
        covers_count: covers,
        items_sold: 0,
        is_complete: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'venue_id,business_date' });

    if (upsertError) throw upsertError;
    rowsLoaded++;

    // 4. Labor (7shifts — POS-independent, some Avero venues have it)
    await syncLaborForVenue(venueId, tipseeLocationUuid, businessDate, netSales, covers);
    rowsLoaded++;

    return { success: true, rowsLoaded, net_sales: netSales, duration: Date.now() - startTime };
  } catch (error) {
    return { success: false, error: error.message, rowsLoaded: 0, net_sales: 0, duration: Date.now() - startTime };
  }
}

// Shared labor sync function (POS-independent — 7shifts data)
async function syncLaborForVenue(venueId, tipseeLocationUuid, businessDate, netSales, covers) {
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

  if (!laborRow || parseInt(laborRow.punch_count) === 0) return;

  let otHours = 0;
  if (laborTable === 'tipsee_7shifts_punches') {
    const otResult = await tipseePool.query(
      `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
      FROM public.tipsee_7shifts_punches
      WHERE location_uuid = $1 AND clocked_in::date = $2::date
        AND clocked_out IS NOT NULL AND deleted IS NOT TRUE
      GROUP BY user_id
      HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`,
      [tipseeLocationUuid, businessDate]
    );
    otHours = otResult.rows.reduce((sum, r) => sum + Math.max(0, parseFloat(r.daily_hours) - 8), 0);
  } else if (laborTable === 'new_tipsee_punches') {
    const otResult = await tipseePool.query(
      `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
      FROM public.new_tipsee_punches
      WHERE location_uuid = $1 AND clocked_in::date = $2::date
        AND clocked_out IS NOT NULL AND is_deleted IS NOT TRUE
      GROUP BY user_id
      HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`,
      [tipseeLocationUuid, businessDate]
    );
    otHours = otResult.rows.reduce((sum, r) => sum + Math.max(0, parseFloat(r.daily_hours) - 8), 0);
  }

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
    net_sales: netSales,
    covers: covers,
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
  }
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

    // Calculate category breakdowns (raw item-level gross — NOT final values)
    let grossFood = 0, grossBev = 0, grossWine = 0, grossLiquor = 0, grossBeer = 0, grossOther = 0;
    let totalItemsSold = 0;

    for (const row of categoryResult.rows) {
      const categoryType = getCategoryType(row.category);
      const sales = parseFloat(row.gross_sales) || 0;
      totalItemsSold += parseInt(row.quantity_sold) || 0;

      switch (categoryType) {
        case 'food': grossFood += sales; break;
        case 'wine': grossWine += sales; grossBev += sales; break;
        case 'liquor': grossLiquor += sales; grossBev += sales; break;
        case 'beer': grossBeer += sales; grossBev += sales; break;
        case 'beverage': grossBev += sales; break;
        default: grossOther += sales;
      }
    }

    // Proportional allocation: distribute check-level net_sales across categories
    // Item-level price*quantity can be 2-5x check-level revenue (packages, minimums, bottle service)
    const grossTotal = grossFood + grossBev + grossOther;
    const venueNetSales = parseFloat(summary.net_sales) || 0;
    let foodSales = 0, beverageSales = 0, wineSales = 0, liquorSales = 0, beerSales = 0, otherSales = 0;

    if (grossTotal > 0 && venueNetSales > 0) {
      const ratio = venueNetSales / grossTotal;
      foodSales     = Math.round(grossFood   * ratio * 100) / 100;
      beverageSales = Math.round(grossBev    * ratio * 100) / 100;
      wineSales     = Math.round(grossWine   * ratio * 100) / 100;
      liquorSales   = Math.round(grossLiquor * ratio * 100) / 100;
      beerSales     = Math.round(grossBeer   * ratio * 100) / 100;
      otherSales    = Math.round(grossOther  * ratio * 100) / 100;

      // Absorb rounding remainder into the largest bucket
      const allocated = foodSales + beverageSales + otherSales;
      const remainder = Math.round((venueNetSales - allocated) * 100) / 100;
      if (remainder !== 0) {
        if (foodSales >= beverageSales && foodSales >= otherSales) {
          foodSales = Math.round((foodSales + remainder) * 100) / 100;
        } else if (beverageSales >= otherSales) {
          beverageSales = Math.round((beverageSales + remainder) * 100) / 100;
        } else {
          otherSales = Math.round((otherSales + remainder) * 100) / 100;
        }
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
        net_sales: venueNetSales,
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

    // 5. Extract and upsert labor_day_facts (shared function)
    const netSales = parseFloat(summary.net_sales) || 0;
    const covers = parseInt(summary.total_covers) || 0;
    await syncLaborForVenue(venueId, tipseeLocationUuid, businessDate, netSales, covers);
    rowsLoaded++;

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

  // Pre-detect POS types for all venues
  const posTypes = new Map();
  for (const m of mappings) {
    posTypes.set(m.venue_id, await getPosType(m.tipsee_location_uuid));
  }
  console.log(`Venues: ${mappings.map(v => {
    const pt = posTypes.get(v.venue_id);
    const tag = pt === 'simphony' ? ' [Simphony]' : pt === 'avero' ? ' [Avero]' : '';
    return `${v.venue_name}${tag}`;
  }).join(', ')}`);

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
      const posType = posTypes.get(mapping.venue_id) || 'upserve';
      let result;
      if (posType === 'simphony') {
        result = await syncVenueDaySimphony(mapping.venue_id, mapping.tipsee_location_uuid, dateStr);
      } else if (posType === 'avero') {
        result = await syncVenueDayAvero(mapping.venue_id, mapping.tipsee_location_uuid, dateStr);
      } else {
        result = await syncVenueDay(mapping.venue_id, mapping.tipsee_location_uuid, dateStr);
      }

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
