/**
 * FULL BACKFILL — All venues, all dates, all fact tables
 * Robust version with connection recovery and batching.
 *
 * Fills: venue_day_facts, category_day_facts, server_day_facts,
 *        item_day_facts, labor_day_facts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function makeTipseePool() {
  return new pg.Pool({
    host: process.env.TIPSEE_DB_HOST,
    port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
    database: process.env.TIPSEE_DB_NAME,
    user: process.env.TIPSEE_DB_USER,
    password: process.env.TIPSEE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
}

let pool = makeTipseePool();

// Reconnect helper
async function query(sql, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (err) {
      if (attempt < 2 && (err.message.includes('terminated') || err.message.includes('Connection') || err.message.includes('ECONNRESET'))) {
        console.log(`    ⟳ reconnecting (attempt ${attempt + 2})...`);
        try { await pool.end(); } catch {}
        pool = makeTipseePool();
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// ── Category mapping ──
const CATEGORY_MAP = {
  'Food': 'food', 'FOOD': 'food', 'Entree': 'food', 'Appetizer': 'food',
  'Dessert': 'food', 'Side': 'food', 'Salad': 'food', 'Soup': 'food',
  'Beverage': 'beverage', 'BEVERAGE': 'beverage', 'Drinks': 'beverage',
  'Wine': 'wine', 'WINE': 'wine', 'Wine by Glass': 'wine', 'Wine by Bottle': 'wine',
  'BTG': 'wine', 'BTB': 'wine',
  'Liquor': 'liquor', 'LIQUOR': 'liquor', 'Spirits': 'liquor',
  'Cocktail': 'liquor', 'Cocktails': 'liquor',
  'Beer': 'beer', 'BEER': 'beer', 'Beers': 'beer', 'Draft': 'beer',
};
function catType(c) { return CATEGORY_MAP[c] || 'other'; }

// ── Get ALL existing dates from Supabase (paginated) ──
async function getExistingDates(venueId) {
  const dates = new Set();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await sb.from('venue_day_facts')
      .select('business_date')
      .eq('venue_id', venueId)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) dates.add(r.business_date);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return dates;
}

// ── Get existing labor dates ──
async function getExistingLaborDates(venueId) {
  const dates = new Set();
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await sb.from('labor_day_facts')
      .select('business_date')
      .eq('venue_id', venueId)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) dates.add(r.business_date);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return dates;
}

// ── Sync single Upserve venue-day ──
async function syncUpserveDay(venueId, locUuid, locName, date) {
  // Check summary
  let result = await query(
    `SELECT COUNT(*) as total_checks, SUM(guest_count) as total_covers,
     SUM(revenue_total) as gross_sales, SUM(sub_total) as net_sales,
     SUM(tax_total) as total_tax, SUM(comp_total) as total_comps, SUM(void_total) as total_voids
     FROM tipsee_checks WHERE location_uuid = $1 AND trading_day = $2`,
    [locUuid, date]
  );
  let summary = result.rows[0];
  let useHistorical = false;

  if (!summary || (parseFloat(summary.net_sales) === 0 && parseInt(summary.total_checks) === 0)) {
    if (locName) {
      const fb = await query(
        `SELECT COUNT(*) as total_checks, SUM(guest_count) as total_covers,
         SUM(revenue_total) as gross_sales, SUM(sub_total) as net_sales,
         SUM(tax_total) as total_tax, SUM(comp_total) as total_comps, SUM(void_total) as total_voids
         FROM checks WHERE location = $1 AND trading_day = $2`,
        [locName, date]
      );
      if (fb.rows[0] && parseFloat(fb.rows[0].net_sales) > 0) {
        summary = fb.rows[0];
        useHistorical = true;
      }
    }
  }

  if (!summary || (parseFloat(summary.net_sales) === 0 && parseInt(summary.total_checks) === 0)) return null;

  // Category breakdown
  const catResult = useHistorical
    ? await query(
        `SELECT COALESCE(ci.parent_category, 'Other') as category,
         SUM(ci.price * ci.quantity) as gross_sales, SUM(ci.quantity) as quantity_sold,
         SUM(COALESCE(ci.comp_total, 0)) as comps_total, 0 as voids_total
         FROM check_items ci JOIN checks c ON ci.check_id = c.id
         WHERE c.location = $1 AND c.trading_day = $2 GROUP BY ci.parent_category`,
        [locName, date]
      )
    : await query(
        `SELECT COALESCE(parent_category, 'Other') as category,
         SUM(price * quantity) as gross_sales, SUM(quantity) as quantity_sold,
         SUM(comp_total) as comps_total, SUM(void_value) as voids_total
         FROM tipsee_check_items WHERE location_uuid = $1 AND trading_day = $2
         GROUP BY parent_category`,
        [locUuid, date]
      );

  let grossFood = 0, grossBev = 0, grossWine = 0, grossLiquor = 0, grossBeer = 0, grossOther = 0, totalItems = 0;
  for (const row of catResult.rows) {
    const ct = catType(row.category);
    const s = parseFloat(row.gross_sales) || 0;
    totalItems += parseInt(row.quantity_sold) || 0;
    if (ct === 'food') grossFood += s;
    else if (ct === 'wine') { grossWine += s; grossBev += s; }
    else if (ct === 'liquor') { grossLiquor += s; grossBev += s; }
    else if (ct === 'beer') { grossBeer += s; grossBev += s; }
    else if (ct === 'beverage') grossBev += s;
    else grossOther += s;
  }

  const grossTotal = grossFood + grossBev + grossOther;
  const venueNet = parseFloat(summary.net_sales) || 0;
  let foodSales = 0, bevSales = 0, wineSales = 0, liquorSales = 0, beerSales = 0, otherSales = 0;
  if (grossTotal > 0 && venueNet > 0) {
    const ratio = venueNet / grossTotal;
    foodSales = Math.round(grossFood * ratio * 100) / 100;
    bevSales = Math.round(grossBev * ratio * 100) / 100;
    wineSales = Math.round(grossWine * ratio * 100) / 100;
    liquorSales = Math.round(grossLiquor * ratio * 100) / 100;
    beerSales = Math.round(grossBeer * ratio * 100) / 100;
    otherSales = Math.round(grossOther * ratio * 100) / 100;
    const allocated = foodSales + bevSales + otherSales;
    const rem = Math.round((venueNet - allocated) * 100) / 100;
    if (Math.abs(rem) > 0) {
      if (foodSales >= bevSales && foodSales >= otherSales) foodSales += rem;
      else if (bevSales >= otherSales) bevSales += rem;
      else otherSales += rem;
    }
  }

  // Tips
  const tipsResult = useHistorical
    ? await query(
        `SELECT COALESCE(SUM(tip_amount), 0) as tips_total FROM payments p
         JOIN checks c ON p.check_id = c.id WHERE c.location = $1 AND c.trading_day = $2`,
        [locName, date]
      )
    : await query(
        `SELECT COALESCE(SUM(tip_amount), 0) as tips_total FROM tipsee_payments p
         JOIN tipsee_checks c ON p.check_id = c.id WHERE c.location_uuid = $1 AND c.trading_day = $2`,
        [locUuid, date]
      );
  const tipsTotal = parseFloat(tipsResult.rows[0]?.tips_total) || 0;

  // Upsert venue_day_facts
  await sb.from('venue_day_facts').upsert({
    venue_id: venueId, business_date: date,
    gross_sales: parseFloat(summary.gross_sales) || 0,
    net_sales: venueNet, food_sales: foodSales, beverage_sales: bevSales,
    wine_sales: wineSales, liquor_sales: liquorSales, beer_sales: beerSales, other_sales: otherSales,
    comps_total: parseFloat(summary.total_comps) || 0,
    voids_total: parseFloat(summary.total_voids) || 0,
    taxes_total: parseFloat(summary.total_tax) || 0,
    tips_total: tipsTotal,
    checks_count: parseInt(summary.total_checks) || 0,
    covers_count: parseInt(summary.total_covers) || 0,
    items_sold: totalItems, is_complete: true,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,business_date' });

  // Category day facts
  for (const cat of catResult.rows) {
    const catGross = parseFloat(cat.gross_sales) || 0;
    const catNet = grossTotal > 0 ? Math.round(catGross * (venueNet / grossTotal) * 100) / 100 : 0;
    await sb.from('category_day_facts').upsert({
      venue_id: venueId, business_date: date, category: cat.category || 'Other',
      gross_sales: catGross, net_sales: catNet,
      quantity_sold: parseInt(cat.quantity_sold) || 0,
      comps_total: parseFloat(cat.comps_total) || 0,
      voids_total: parseFloat(cat.voids_total) || 0,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'venue_id,business_date,category' });
  }

  // Server day facts
  const serverResult = useHistorical
    ? await query(
        `SELECT employee_name, employee_role_name as employee_role, COUNT(*) as checks_count,
         SUM(guest_count) as covers_count, SUM(revenue_total) as gross_sales,
         SUM(comp_total) as comps_total,
         ROUND(AVG(CASE WHEN close_time > open_time THEN EXTRACT(EPOCH FROM (close_time - open_time))/60 END)::numeric, 0) as avg_turn_mins
         FROM checks WHERE location = $1 AND trading_day = $2
         GROUP BY employee_name, employee_role_name ORDER BY gross_sales DESC`,
        [locName, date]
      )
    : await query(
        `SELECT employee_name, employee_role_name as employee_role, COUNT(*) as checks_count,
         SUM(guest_count) as covers_count, SUM(revenue_total) as gross_sales,
         SUM(comp_total) as comps_total,
         ROUND(AVG(CASE WHEN close_time > open_time THEN EXTRACT(EPOCH FROM (close_time - open_time))/60 END)::numeric, 0) as avg_turn_mins
         FROM tipsee_checks WHERE location_uuid = $1 AND trading_day = $2
         GROUP BY employee_name, employee_role_name ORDER BY gross_sales DESC`,
        [locUuid, date]
      );
  for (const s of serverResult.rows) {
    if (!s.employee_name) continue;
    await sb.from('server_day_facts').upsert({
      venue_id: venueId, business_date: date,
      employee_name: s.employee_name, employee_role: s.employee_role,
      gross_sales: parseFloat(s.gross_sales) || 0,
      checks_count: parseInt(s.checks_count) || 0,
      covers_count: parseInt(s.covers_count) || 0,
      comps_total: parseFloat(s.comps_total) || 0,
      avg_turn_mins: parseFloat(s.avg_turn_mins) || 0,
      tips_total: 0, last_synced_at: new Date().toISOString(),
    }, { onConflict: 'venue_id,business_date,employee_name' });
  }

  // Item day facts (top 100)
  const itemResult = useHistorical
    ? await query(
        `SELECT ci.name as menu_item_name, ci.parent_category, ci.category,
         SUM(ci.quantity) as quantity_sold, SUM(ci.price * ci.quantity) as gross_sales,
         SUM(ci.price * ci.quantity) as net_sales, SUM(COALESCE(ci.comp_total, 0)) as comps_total, 0 as voids_total
         FROM check_items ci JOIN checks c ON ci.check_id = c.id
         WHERE c.location = $1 AND c.trading_day = $2
         GROUP BY ci.name, ci.parent_category, ci.category ORDER BY gross_sales DESC LIMIT 100`,
        [locName, date]
      )
    : await query(
        `SELECT name as menu_item_name, parent_category, category,
         SUM(quantity) as quantity_sold, SUM(price * quantity) as gross_sales,
         SUM(price * quantity) as net_sales, SUM(comp_total) as comps_total, SUM(void_value) as voids_total
         FROM tipsee_check_items WHERE location_uuid = $1 AND trading_day = $2
         GROUP BY name, parent_category, category ORDER BY gross_sales DESC LIMIT 100`,
        [locUuid, date]
      );
  for (const item of itemResult.rows) {
    if (!item.menu_item_name) continue;
    await sb.from('item_day_facts').upsert({
      venue_id: venueId, business_date: date,
      menu_item_name: item.menu_item_name,
      parent_category: item.parent_category, category: item.category,
      quantity_sold: parseFloat(item.quantity_sold) || 0,
      gross_sales: parseFloat(item.gross_sales) || 0,
      net_sales: parseFloat(item.net_sales) || 0,
      comps_total: parseFloat(item.comps_total) || 0,
      voids_total: parseFloat(item.voids_total) || 0,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'venue_id,business_date,menu_item_name' });
  }

  return { net: venueNet, checks: parseInt(summary.total_checks) || 0 };
}

// ── Sync single Simphony venue-day ──
async function syncSimphonyDay(venueId, locUuid, date) {
  const result = await query(
    `SELECT COALESCE(SUM(check_count), 0) as total_checks,
     COALESCE(SUM(guest_count), 0) as total_covers,
     COALESCE(SUM(gross_sales), 0) as gross_sales,
     COALESCE(SUM(net_sales), 0) as net_sales,
     COALESCE(SUM(tax_total), 0) as total_tax,
     ABS(COALESCE(SUM(discount_total), 0)) as total_comps,
     ABS(COALESCE(SUM(void_total), 0)) as total_voids,
     COALESCE(SUM(CASE WHEN LOWER(COALESCE(revenue_center_name, '')) LIKE '%bar%'
       OR (revenue_center_name IS NULL AND revenue_center_number = 2)
       THEN net_sales ELSE 0 END), 0) as beverage_sales,
     COALESCE(SUM(CASE WHEN LOWER(COALESCE(revenue_center_name, '')) NOT LIKE '%bar%'
       AND NOT (revenue_center_name IS NULL AND revenue_center_number = 2)
       THEN net_sales ELSE 0 END), 0) as food_sales
     FROM tipsee_simphony_sales WHERE location_uuid = $1 AND trading_day = $2`,
    [locUuid, date]
  );

  const row = result.rows[0];
  if (!row || (parseFloat(row.net_sales) === 0 && parseInt(row.total_checks) === 0)) return null;

  await sb.from('venue_day_facts').upsert({
    venue_id: venueId, business_date: date,
    gross_sales: parseFloat(row.gross_sales) || 0,
    net_sales: parseFloat(row.net_sales) || 0,
    food_sales: parseFloat(row.food_sales) || 0,
    beverage_sales: parseFloat(row.beverage_sales) || 0,
    wine_sales: 0, liquor_sales: 0, beer_sales: 0, other_sales: 0,
    comps_total: parseFloat(row.total_comps) || 0,
    voids_total: parseFloat(row.total_voids) || 0,
    taxes_total: parseFloat(row.total_tax) || 0,
    tips_total: 0,
    checks_count: parseInt(row.total_checks) || 0,
    covers_count: parseInt(row.total_covers) || 0,
    items_sold: 0, is_complete: true,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,business_date' });

  return { net: parseFloat(row.net_sales), checks: parseInt(row.total_checks) };
}

// ── Sync labor for any venue-day ──
async function syncLabor(venueId, locUuid, date, netSales, covers) {
  let laborResult = await query(
    `SELECT COUNT(*) as punch_count, COUNT(DISTINCT user_id) as employee_count,
     COALESCE(SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600), 0) as total_hours,
     COALESCE(SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600 *
       CASE WHEN COALESCE(hourly_wage, 0) > 100 THEN COALESCE(hourly_wage, 0) / 100.0 ELSE COALESCE(hourly_wage, 0) END
     ), 0) as labor_cost
     FROM tipsee_7shifts_punches
     WHERE location_uuid = $1 AND clocked_in::date = $2::date
       AND clocked_out IS NOT NULL AND deleted IS NOT TRUE`,
    [locUuid, date]
  );

  let laborRow = laborResult.rows[0];
  let laborTable = 'tipsee_7shifts_punches';

  if (!laborRow || parseInt(laborRow.punch_count) === 0) {
    const fb = await query(
      `SELECT COUNT(*) as punch_count, COUNT(DISTINCT p.user_id) as employee_count,
       COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0) as total_hours,
       COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 *
         COALESCE(w.wage_cents, 0) / 100), 0) as labor_cost
       FROM new_tipsee_punches p
       LEFT JOIN LATERAL (
         SELECT wage_cents FROM new_tipsee_7shifts_users_wages
         WHERE user_id = p.user_id AND effective_date <= p.clocked_in::date
         ORDER BY effective_date DESC LIMIT 1
       ) w ON true
       WHERE p.location_uuid = $1 AND p.clocked_in::date = $2::date
         AND p.clocked_out IS NOT NULL AND p.is_deleted IS NOT TRUE`,
      [locUuid, date]
    );
    if (fb.rows[0] && parseInt(fb.rows[0].punch_count) > 0) {
      laborRow = fb.rows[0];
      laborTable = 'new_tipsee_punches';
    }
  }

  if (!laborRow || parseInt(laborRow.punch_count) === 0) return false;

  // OT hours
  const otQuery = laborTable === 'tipsee_7shifts_punches'
    ? `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
       FROM tipsee_7shifts_punches WHERE location_uuid = $1 AND clocked_in::date = $2::date
       AND clocked_out IS NOT NULL AND deleted IS NOT TRUE
       GROUP BY user_id HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`
    : `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
       FROM new_tipsee_punches WHERE location_uuid = $1 AND clocked_in::date = $2::date
       AND clocked_out IS NOT NULL AND is_deleted IS NOT TRUE
       GROUP BY user_id HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`;
  const otResult = await query(otQuery, [locUuid, date]);
  const otHours = otResult.rows.reduce((sum, r) => sum + Math.max(0, parseFloat(r.daily_hours) - 8), 0);

  // FOH/BOH
  let fohHours = 0, fohCost = 0, fohEmpCount = 0;
  let bohHours = 0, bohCost = 0, bohEmpCount = 0;
  let otherHours = 0, otherCost = 0, otherEmpCount = 0;

  if (laborTable === 'tipsee_7shifts_punches') {
    const deptResult = await query(
      `SELECT CASE WHEN d.name = 'FOH' THEN 'FOH' WHEN d.name = 'BOH' THEN 'BOH' ELSE 'Other' END as dept_group,
        COUNT(DISTINCT p.user_id) as employee_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0) as total_hours,
        COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 *
          CASE WHEN COALESCE(p.hourly_wage, 0) > 100 THEN COALESCE(p.hourly_wage, 0) / 100.0 ELSE COALESCE(p.hourly_wage, 0) END
        ), 0) as labor_cost
       FROM tipsee_7shifts_punches p
       LEFT JOIN (SELECT DISTINCT ON (id) id, name FROM departments) d ON d.id = p.department_id
       WHERE p.location_uuid = $1 AND p.clocked_in::date = $2::date
         AND p.clocked_out IS NOT NULL AND p.deleted IS NOT TRUE
       GROUP BY dept_group`,
      [locUuid, date]
    );
    for (const r of deptResult.rows) {
      if (r.dept_group === 'FOH') { fohHours = parseFloat(r.total_hours) || 0; fohCost = parseFloat(r.labor_cost) || 0; fohEmpCount = parseInt(r.employee_count) || 0; }
      else if (r.dept_group === 'BOH') { bohHours = parseFloat(r.total_hours) || 0; bohCost = parseFloat(r.labor_cost) || 0; bohEmpCount = parseInt(r.employee_count) || 0; }
      else { otherHours = parseFloat(r.total_hours) || 0; otherCost = parseFloat(r.labor_cost) || 0; otherEmpCount = parseInt(r.employee_count) || 0; }
    }
  }

  await sb.from('labor_day_facts').upsert({
    venue_id: venueId, business_date: date,
    total_hours: parseFloat(laborRow.total_hours) || 0,
    ot_hours: otHours,
    labor_cost: parseFloat(laborRow.labor_cost) || 0,
    punch_count: parseInt(laborRow.punch_count) || 0,
    employee_count: parseInt(laborRow.employee_count) || 0,
    net_sales: netSales || 0, covers: covers || 0,
    foh_hours: fohHours, foh_cost: fohCost, foh_employee_count: fohEmpCount,
    boh_hours: bohHours, boh_cost: bohCost, boh_employee_count: bohEmpCount,
    other_hours: otherHours, other_cost: otherCost, other_employee_count: otherEmpCount,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'venue_id,business_date' });

  return true;
}


// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

console.log('═══ FULL BACKFILL — All Venues, All Dates ═══\n');

// Get venue mappings
const { data: mappingData } = await sb.from('venue_tipsee_mapping')
  .select('venue_id, tipsee_location_uuid, tipsee_location_name, venues!inner(name)')
  .eq('is_active', true);

const mappings = (mappingData || []).map(r => ({
  venueId: r.venue_id,
  locUuid: r.tipsee_location_uuid,
  locName: r.tipsee_location_name || '',
  venueName: r.venues?.name || 'Unknown',
}));

console.log(`Found ${mappings.length} active venue mappings\n`);

let grandNewDays = 0, grandLaborDays = 0;

for (const m of mappings) {
  const posResult = await query(`SELECT pos_type FROM general_locations WHERE uuid = $1 LIMIT 1`, [m.locUuid]);
  const posType = posResult.rows[0]?.pos_type || 'upserve';
  const isSimphony = posType === 'simphony';

  console.log(`\n── ${m.venueName} (${posType}) ──`);

  // Get all trading days from TipSee
  let allDays = [];
  let locName = m.locName;
  if (isSimphony) {
    const r = await query(`SELECT DISTINCT trading_day FROM tipsee_simphony_sales WHERE location_uuid = $1 ORDER BY trading_day`, [m.locUuid]);
    allDays = r.rows.map(r => r.trading_day.toISOString().split('T')[0]);
  } else {
    // tipsee_checks + historical checks
    const r1 = await query(`SELECT DISTINCT trading_day FROM tipsee_checks WHERE location_uuid = $1 ORDER BY trading_day`, [m.locUuid]);
    const tipseeDays = r1.rows.map(r => r.trading_day.toISOString().split('T')[0]);

    // Get location name for historical fallback
    if (!locName) {
      const ln = await query(`SELECT location_name FROM general_locations WHERE uuid = $1 LIMIT 1`, [m.locUuid]);
      locName = ln.rows[0]?.location_name || '';
    }

    let histDays = [];
    if (locName) {
      const r2 = await query(`SELECT DISTINCT trading_day FROM checks WHERE location = $1 ORDER BY trading_day`, [locName]);
      histDays = r2.rows.map(r => r.trading_day.toISOString().split('T')[0]);
    }

    allDays = [...new Set([...histDays, ...tipseeDays])].sort();
  }

  // Get existing in Supabase (paginated)
  const existingFacts = await getExistingDates(m.venueId);
  const existingLabor = await getExistingLaborDates(m.venueId);

  const missingFacts = allDays.filter(d => !existingFacts.has(d));
  const missingLabor = allDays.filter(d => !existingLabor.has(d));

  console.log(`  TipSee: ${allDays.length} days | Facts: ${existingFacts.size} exist, ${missingFacts.length} missing | Labor: ${existingLabor.size} exist, ${missingLabor.length} missing`);

  // ── Phase 1: Backfill missing venue_day_facts ──
  let newCount = 0;
  for (const date of missingFacts) {
    try {
      const result = isSimphony
        ? await syncSimphonyDay(m.venueId, m.locUuid, date)
        : await syncUpserveDay(m.venueId, m.locUuid, locName, date);
      if (result) newCount++;
      if (newCount % 25 === 0 && newCount > 0) process.stdout.write(`  ... ${newCount}/${missingFacts.length} facts\r`);
    } catch (err) {
      console.log(`  ⚠ ${date}: ${err.message.slice(0, 80)}`);
    }
  }
  if (newCount > 0) console.log(`  ✅ ${newCount} new venue-days synced          `);
  grandNewDays += newCount;

  // ── Phase 2: Backfill missing labor ──
  let laborCount = 0;
  for (const date of missingLabor) {
    try {
      // Get net_sales from venue_day_facts for context
      const { data: fact } = await sb.from('venue_day_facts')
        .select('net_sales, covers_count')
        .eq('venue_id', m.venueId)
        .eq('business_date', date)
        .single();

      const had = await syncLabor(m.venueId, m.locUuid, date, fact?.net_sales || 0, fact?.covers_count || 0);
      if (had) laborCount++;
      if (laborCount % 25 === 0 && laborCount > 0) process.stdout.write(`  ... ${laborCount} labor days\r`);
    } catch {
      // Skip silently — many dates won't have labor
    }
  }
  if (laborCount > 0) console.log(`  ✅ ${laborCount} labor days synced            `);
  grandLaborDays += laborCount;
}

try { await pool.end(); } catch {}

console.log(`\n═══════════════════════════════════`);
console.log(`NEW venue_day_facts: ${grandNewDays}`);
console.log(`NEW labor_day_facts: ${grandLaborDays}`);
console.log(`✓ Done`);
