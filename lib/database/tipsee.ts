/**
 * TipSee Database Connection
 * Connects to TipSee POS data for nightly reports
 */

import { Pool } from 'pg';
import { getServiceClient } from '@/lib/supabase/service';

// TipSee database configuration — credentials MUST be in environment variables
const TIPSEE_CONFIG = {
  host: process.env.TIPSEE_DB_HOST!,
  user: process.env.TIPSEE_DB_USER!,
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD!,
  ssl: { rejectUnauthorized: false },
  max: 15, // Increased from 5 to handle 10 parallel queries + headroom for concurrent users
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000, // Increased from 10s to 20s for slow Azure connections
  statement_timeout: 12000, // Kill queries after 12s — prevents indefinite hangs
};

// Singleton pool
let tipseePool: Pool | null = null;

export function getTipseePool(): Pool {
  if (!tipseePool) {
    tipseePool = new Pool(TIPSEE_CONFIG);
    tipseePool.on('error', (err) => {
      console.error('TipSee pool error:', err);
    });
  }
  return tipseePool;
}

export async function closeTipseePool(): Promise<void> {
  if (tipseePool) {
    await tipseePool.end();
    tipseePool = null;
  }
}

// Type for cleaning database rows - converts bigints and numeric strings to numbers
export function cleanRow(row: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') {
      clean[k] = Number(v);
    } else if (v instanceof Date) {
      clean[k] = v.toISOString();
    } else if (typeof v === 'string' && v !== '' && !isNaN(Number(v)) && !isNaN(parseFloat(v))) {
      // Convert numeric strings (from PostgreSQL SUM/COUNT) to numbers
      clean[k] = parseFloat(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

export interface NightlyReportData {
  date: string;
  summary: {
    trading_day: string;
    total_checks: number;
    total_covers: number;
    net_sales: number;
    sub_total: number;
    total_tax: number;
    total_comps: number;
    total_voids: number;
  };
  salesByCategory: Array<{
    category: string;
    gross_sales: number;
    comps: number;
    voids: number;
    net_sales: number;
  }>;
  salesBySubcategory: Array<{
    parent_category: string;
    category: string;
    net_sales: number;
  }>;
  servers: Array<{
    employee_name: string;
    employee_role_name: string;
    tickets: number;
    covers: number;
    net_sales: number;
    avg_ticket: number;
    avg_turn_mins: number;
    avg_per_cover: number;
    tip_pct: number | null;
    total_tips: number;
  }>;
  menuItems: Array<{
    name: string;
    qty: number;
    net_total: number;
    parent_category: string;
  }>;
  discounts: Array<{
    reason: string;
    qty: number;
    amount: number;
  }>;
  detailedComps: Array<{
    check_id: string;
    table_name: string;
    server: string;
    comp_total: number;
    check_total: number;
    reason: string;
    comped_items: string[];
  }>;
  logbook: any | null;
  notableGuests: Array<{
    check_id: string;
    server: string;
    covers: number;
    payment: number;
    table_name: string;
    cardholder_name: string | null;
    tip_amount: number | null;
    tip_percent: number | null;
    items: string[];
    additional_items: number;
  }>;
  peopleWeKnow: Array<{
    first_name: string;
    last_name: string;
    is_vip: boolean;
    tags: string[] | null;
    party_size: number;
    total_payment: number;
    status: string;
  }>;
}

// Helper: extract result from allSettled, return fallback on failure
function settled<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === 'fulfilled') return result.value;
  console.error(`[nightly] ${label} query failed:`, result.reason);
  return fallback;
}

// Empty query result for fallback (matches pg QueryResult shape)
const EMPTY_RESULT = { rows: [] as any[], rowCount: 0, command: '', oid: 0, fields: [] as any[] };

export async function fetchNightlyReport(
  date: string,
  locationUuid: string
): Promise<NightlyReportData> {
  const pool = getTipseePool();
  const t0 = Date.now();

  // Timing wrapper for per-query profiling
  const timed = <T,>(label: string, promise: Promise<T>): Promise<T> => {
    const start = Date.now();
    return promise.then(
      (r) => { console.log(`[nightly:query] ${label}: ${Date.now() - start}ms`); return r; },
      (e) => { console.log(`[nightly:query] ${label}: ${Date.now() - start}ms FAILED`); throw e; },
    );
  };

  // Run all 10 independent queries in parallel — allSettled so non-critical
  // failures don't nuke the whole page. Pool max=5 naturally caps concurrency.
  const results = await Promise.allSettled([
    // 0: Daily Summary
    timed('0:summary', pool.query(
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
    )),

    // 1: Sales by Category (true net = gross - comps - voids)
    timed('1:salesByCategory', pool.query(
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
    )),

    // 2: Sales by Subcategory
    timed('2:salesBySub', pool.query(
      `SELECT
        COALESCE(parent_category, 'Other') as parent_category,
        category,
        SUM(price * quantity) as net_sales
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY parent_category, category
      ORDER BY parent_category, net_sales DESC`,
      [locationUuid, date]
    )),

    // 3: Server Performance (pre-aggregate tips to avoid LATERAL per-row)
    timed('3:servers', pool.query(
      `WITH check_tips AS (
        SELECT check_id, SUM(tip_amount) as total_tips
        FROM public.tipsee_payments
        WHERE check_id IN (SELECT id FROM public.tipsee_checks WHERE location_uuid = $1 AND trading_day = $2)
          AND tip_amount > 0
        GROUP BY check_id
      )
      SELECT
        c.employee_name,
        c.employee_role_name,
        COUNT(*) as tickets,
        SUM(c.guest_count) as covers,
        SUM(c.revenue_total) as net_sales,
        ROUND(AVG(c.revenue_total)::numeric, 2) as avg_ticket,
        ROUND(AVG(CASE WHEN c.close_time > c.open_time THEN EXTRACT(EPOCH FROM (c.close_time - c.open_time))/60 END)::numeric, 0) as avg_turn_mins,
        ROUND((SUM(c.revenue_total) / NULLIF(SUM(c.guest_count), 0))::numeric, 2) as avg_per_cover,
        ROUND((SUM(COALESCE(ct.total_tips, 0)) / NULLIF(SUM(c.revenue_total), 0) * 100)::numeric, 1) as tip_pct,
        SUM(COALESCE(ct.total_tips, 0)) as total_tips
      FROM public.tipsee_checks c
      LEFT JOIN check_tips ct ON ct.check_id = c.id
      WHERE c.location_uuid = $1 AND c.trading_day = $2
      GROUP BY c.employee_name, c.employee_role_name
      ORDER BY net_sales DESC`,
      [locationUuid, date]
    )),

    // 4: Menu Items Sold (top 10 food + top 10 beverage + top 10 other)
    timed('4:menuItems', pool.query(
      `WITH ranked_items AS (
        SELECT
          ci.name,
          COALESCE(ci.parent_category, 'Other') as parent_category,
          SUM(ci.quantity) as qty,
          SUM(ci.price * ci.quantity) as net_total,
          ROW_NUMBER() OVER (
            PARTITION BY CASE
              WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
              THEN 'Beverage'
              WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%food%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%appetizer%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%entree%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%dessert%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%salad%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%soup%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%side%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%brunch%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%lunch%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%dinner%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%starter%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%snack%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%raw bar%'
                OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%sushi%'
              THEN 'Food'
              ELSE 'Other'
            END
            ORDER BY SUM(ci.price * ci.quantity) DESC
          ) as rn,
          CASE
            WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
            THEN 'Beverage'
            WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%food%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%appetizer%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%entree%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%dessert%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%salad%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%soup%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%side%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%brunch%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%lunch%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%dinner%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%starter%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%snack%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%raw bar%'
              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%sushi%'
            THEN 'Food'
            ELSE 'Other'
          END as item_type
        FROM public.tipsee_check_items ci
        WHERE ci.location_uuid = $1 AND ci.trading_day = $2
        GROUP BY ci.name, ci.parent_category
      )
      SELECT name, parent_category, qty, net_total, item_type
      FROM ranked_items
      WHERE rn <= 10
      ORDER BY CASE item_type WHEN 'Food' THEN 1 WHEN 'Beverage' THEN 2 ELSE 3 END, net_total DESC`,
      [locationUuid, date]
    )),

    // 5: Discounts/Comps Summary - combines check-level and item-level comps
    timed('5:discounts', pool.query(
      `WITH check_comps AS (
        SELECT
          COALESCE(NULLIF(voidcomp_reason_text, ''), 'Unknown') as reason,
          id as check_id,
          comp_total as amount
        FROM public.tipsee_checks
        WHERE location_uuid = $1 AND trading_day = $2 AND comp_total > 0
      ),
      item_comps AS (
        SELECT
          COALESCE(NULLIF(c.voidcomp_reason_text, ''), 'Unknown') as reason,
          ci.check_id,
          SUM(ci.comp_total) as amount
        FROM public.tipsee_check_items ci
        JOIN public.tipsee_checks c ON ci.check_id = c.id
        WHERE c.location_uuid = $1 AND c.trading_day = $2 AND ci.comp_total > 0
        GROUP BY c.voidcomp_reason_text, ci.check_id
      ),
      all_comps AS (
        SELECT DISTINCT ON (COALESCE(ic.check_id, cc.check_id))
          COALESCE(ic.reason, cc.reason) as reason,
          COALESCE(ic.amount, cc.amount) as amount
        FROM check_comps cc
        FULL OUTER JOIN item_comps ic ON cc.check_id = ic.check_id
        ORDER BY COALESCE(ic.check_id, cc.check_id), ic.amount DESC NULLS LAST
      )
      SELECT reason, COUNT(*) as qty, SUM(amount) as amount
      FROM all_comps
      GROUP BY reason
      ORDER BY amount DESC`,
      [locationUuid, date]
    )),

    // 6: Detailed Comps - finds checks with comps at either check or item level
    timed('6:detailedComps', pool.query(
      `WITH item_comp_totals AS (
        SELECT check_id, SUM(comp_total) as total
        FROM public.tipsee_check_items
        WHERE check_id IN (SELECT id FROM public.tipsee_checks WHERE location_uuid = $1 AND trading_day = $2)
          AND comp_total > 0
        GROUP BY check_id
      )
      SELECT DISTINCT
        c.id as check_id,
        c.table_name,
        c.employee_name as server,
        GREATEST(c.comp_total, COALESCE(ict.total, 0)) as comp_total,
        c.revenue_total as check_total,
        COALESCE(NULLIF(c.voidcomp_reason_text, ''), 'Unknown') as reason
      FROM public.tipsee_checks c
      LEFT JOIN item_comp_totals ict ON ict.check_id = c.id
      WHERE c.location_uuid = $1 AND c.trading_day = $2
        AND (c.comp_total > 0 OR ict.total > 0)
      ORDER BY GREATEST(c.comp_total, COALESCE(ict.total, 0)) DESC`,
      [locationUuid, date]
    )),

    // 7: Logbook
    timed('7:logbook', pool.query(
      `SELECT * FROM public.tipsee_daily_logbook
       WHERE location_uuid = $1 AND logbook_date = $2
       LIMIT 1`,
      [locationUuid, date]
    )),

    // 8: Notable Guests (Top 5 spenders — pre-select top checks, then join payment)
    timed('8:notableGuests', pool.query(
      `WITH top_checks AS (
        SELECT id, employee_name, guest_count, revenue_total, open_time, close_time, table_name
        FROM public.tipsee_checks
        WHERE location_uuid = $1 AND trading_day = $2 AND revenue_total > 0
        ORDER BY revenue_total DESC
        LIMIT 5
      ),
      best_payment AS (
        SELECT DISTINCT ON (p.check_id)
          p.check_id, p.cc_name, p.tip_amount, p.amount
        FROM public.tipsee_payments p
        INNER JOIN top_checks tc ON tc.id = p.check_id
        ORDER BY p.check_id, (p.cc_name IS NOT NULL AND p.cc_name != '') DESC, p.tip_amount DESC NULLS LAST, p.amount DESC
      )
      SELECT
        tc.id as check_id,
        tc.employee_name as server,
        tc.guest_count as covers,
        tc.revenue_total as payment,
        tc.open_time,
        tc.close_time,
        tc.table_name,
        bp.cc_name as cardholder_name,
        bp.tip_amount,
        bp.amount as payment_amount
      FROM top_checks tc
      LEFT JOIN best_payment bp ON bp.check_id = tc.id
      ORDER BY tc.revenue_total DESC`,
      [locationUuid, date]
    )),

    // 9: People We Know (VIP reservations)
    timed('9:peopleWeKnow', pool.query(
      `SELECT
        first_name,
        last_name,
        is_vip,
        tags,
        max_guests as party_size,
        total_payment,
        status
      FROM public.full_reservations
      WHERE location_uuid = $1 AND date = $2
        AND status IN ('COMPLETE', 'ARRIVED', 'SEATED')
      ORDER BY is_vip DESC, total_payment DESC`,
      [locationUuid, date]
    )),
  ]);

  const t1 = Date.now();

  // Extract results with fail-soft defaults
  const summaryResult = settled(results[0], EMPTY_RESULT, 'summary');
  const salesByCategoryResult = settled(results[1], EMPTY_RESULT, 'salesByCategory');
  const salesBySubcategoryResult = settled(results[2], EMPTY_RESULT, 'salesBySubcategory');
  const serversResult = settled(results[3], EMPTY_RESULT, 'servers');
  const menuItemsResult = settled(results[4], EMPTY_RESULT, 'menuItems');
  const discountsResult = settled(results[5], EMPTY_RESULT, 'discounts');
  const detailedCompsResult = settled(results[6], EMPTY_RESULT, 'detailedComps');
  const logbookResult = settled(results[7], EMPTY_RESULT, 'logbook');
  const notableGuestsResult = settled(results[8], EMPTY_RESULT, 'notableGuests');
  const peopleWeKnowResult = settled(results[9], EMPTY_RESULT, 'peopleWeKnow');

  const summary = summaryResult.rows[0]
    ? cleanRow(summaryResult.rows[0])
    : {
        trading_day: date,
        total_checks: 0,
        total_covers: 0,
        net_sales: 0,
        sub_total: 0,
        total_tax: 0,
        total_comps: 0,
        total_voids: 0,
      };

  // Batch comp item lookups: 1 query for ALL comp check IDs (eliminates N+1)
  const compCheckIds = detailedCompsResult.rows.map((r) => r.check_id);
  const compItemsMap = new Map<string, string[]>();
  if (compCheckIds.length > 0) {
    const compItemsResult = await pool.query(
      `SELECT check_id, name, quantity, comp_total
       FROM public.tipsee_check_items
       WHERE check_id = ANY($1::text[]) AND comp_total > 0
       ORDER BY check_id, comp_total DESC`,
      [compCheckIds]
    );
    for (const item of compItemsResult.rows) {
      const label = item.quantity > 1
        ? `${item.name} x${Math.floor(item.quantity)} ($${parseFloat(item.comp_total).toFixed(2)})`
        : `${item.name} ($${parseFloat(item.comp_total).toFixed(2)})`;
      const arr = compItemsMap.get(item.check_id) || [];
      arr.push(label);
      compItemsMap.set(item.check_id, arr);
    }
  }

  const detailedComps = detailedCompsResult.rows.map((check) => {
    const checkData = cleanRow(check);
    checkData.comped_items = compItemsMap.get(check.check_id) || [];
    return checkData;
  });

  const logbook = logbookResult.rows[0] ? cleanRow(logbookResult.rows[0]) : null;

  // Batch notable guest item lookups: 1 query for ALL guest check IDs (eliminates N+1)
  const guestCheckIds = notableGuestsResult.rows.map((r) => r.check_id);
  const guestItemsMap = new Map<string, Array<{ name: string; quantity: number; price: number }>>();
  if (guestCheckIds.length > 0) {
    const guestItemsResult = await pool.query(
      `SELECT check_id, name, quantity, price
       FROM public.tipsee_check_items
       WHERE check_id = ANY($1::text[])
       ORDER BY check_id, price DESC`,
      [guestCheckIds]
    );
    for (const item of guestItemsResult.rows) {
      const arr = guestItemsMap.get(item.check_id) || [];
      arr.push({ name: item.name, quantity: parseFloat(item.quantity) || 1, price: parseFloat(item.price) || 0 });
      guestItemsMap.set(item.check_id, arr);
    }
  }

  const notableGuests = notableGuestsResult.rows.map((guest) => {
    const guestData = cleanRow(guest);

    if (guestData.payment != null && guestData.tip_amount != null) {
      const baseAmount = guestData.payment - guestData.tip_amount;
      guestData.tip_percent = baseAmount > 0 ? Math.round((guestData.tip_amount / baseAmount) * 100) : 0;
    } else {
      guestData.tip_percent = null;
    }

    const allItems = guestItemsMap.get(guest.check_id) || [];
    guestData.items = allItems.slice(0, 5).map((item) => {
      if (item.quantity > 1) return `${item.name} x${Math.floor(item.quantity)}`;
      return item.name;
    });
    guestData.additional_items = Math.max(0, allItems.length - 5);
    return guestData;
  });

  const t2 = Date.now();
  const failCount = results.filter((r) => r.status === 'rejected').length;
  console.log(`[nightly] ${date} ${locationUuid.substring(0, 8)} | queries=${t1 - t0}ms batch=${t2 - t1}ms total=${t2 - t0}ms${failCount ? ` FAILED=${failCount}` : ''}`);

  return {
    date,
    summary: summary as NightlyReportData['summary'],
    salesByCategory: salesByCategoryResult.rows.map(cleanRow) as NightlyReportData['salesByCategory'],
    salesBySubcategory: salesBySubcategoryResult.rows.map(cleanRow) as NightlyReportData['salesBySubcategory'],
    servers: serversResult.rows.map(cleanRow) as NightlyReportData['servers'],
    menuItems: menuItemsResult.rows.map(cleanRow) as NightlyReportData['menuItems'],
    discounts: discountsResult.rows.map(cleanRow) as NightlyReportData['discounts'],
    detailedComps: detailedComps as NightlyReportData['detailedComps'],
    logbook,
    notableGuests: notableGuests as NightlyReportData['notableGuests'],
    peopleWeKnow: peopleWeKnowResult.rows.map(cleanRow) as NightlyReportData['peopleWeKnow'],
  };
}

/**
 * Build a NightlyReportData from venue_day_facts (Supabase).
 * Used for Avero venues which don't have data in tipsee_checks/tipsee_check_items.
 * Returns summary-level data with empty detail arrays (Avero has no server/item breakdown).
 */
export async function fetchNightlyReportFromFacts(
  date: string,
  venueId: string
): Promise<NightlyReportData> {
  const supabase = getServiceClient();

  const { data: fact } = await (supabase as any)
    .from('venue_day_facts')
    .select('*')
    .eq('venue_id', venueId)
    .eq('business_date', date)
    .maybeSingle();

  const summary = fact
    ? {
        trading_day: date,
        total_checks: fact.checks_count || 0,
        total_covers: fact.covers_count || 0,
        net_sales: parseFloat(fact.net_sales) || 0,
        sub_total: parseFloat(fact.net_sales) || 0,
        total_tax: parseFloat(fact.taxes_total) || 0,
        total_comps: parseFloat(fact.comps_total) || 0,
        total_voids: parseFloat(fact.voids_total) || 0,
      }
    : {
        trading_day: date,
        total_checks: 0,
        total_covers: 0,
        net_sales: 0,
        sub_total: 0,
        total_tax: 0,
        total_comps: 0,
        total_voids: 0,
      };

  // Build category breakdown from facts if available
  const salesByCategory: NightlyReportData['salesByCategory'] = [];
  if (fact) {
    const food = parseFloat(fact.food_sales) || 0;
    const bev = parseFloat(fact.beverage_sales) || 0;
    const gross = parseFloat(fact.gross_sales) || 0;
    const other = Math.max(0, gross - food - bev);
    if (food > 0) salesByCategory.push({ category: 'Food', gross_sales: food, comps: 0, voids: 0, net_sales: food });
    if (bev > 0) salesByCategory.push({ category: 'Beverage', gross_sales: bev, comps: 0, voids: 0, net_sales: bev });
    if (other > 0) salesByCategory.push({ category: 'Other', gross_sales: other, comps: 0, voids: 0, net_sales: other });
  }

  return {
    date,
    summary: summary as NightlyReportData['summary'],
    salesByCategory,
    salesBySubcategory: [],
    servers: [],
    menuItems: [],
    discounts: [],
    detailedComps: [],
    logbook: null,
    notableGuests: [],
    peopleWeKnow: [],
  };
}

export interface TipseeLocation {
  name: string;
  uuid: string;
}

export async function fetchTipseeLocations(): Promise<TipseeLocation[]> {
  const pool = getTipseePool();
  const result = await pool.query(
    `SELECT DISTINCT location as name, location_uuid as uuid
     FROM public.tipsee_checks
     WHERE location_uuid IS NOT NULL AND location IS NOT NULL
     ORDER BY location`
  );
  return result.rows.map(cleanRow) as TipseeLocation[];
}

// ============================================================================
// INTRA-DAY SUMMARY (lightweight, for 5-min sales pace polling)
// ============================================================================

export interface IntraDaySummary {
  total_checks: number;
  total_covers: number;
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  other_sales: number;
  comps_total: number;
  voids_total: number;
}

/**
 * Fetch running totals for a single business day — two lightweight queries.
 * Query 1: check-level aggregates (checks, covers, net, comps, voids)
 * Query 2: category-level food/bev split from check_items
 */
export async function fetchIntraDaySummary(
  locationUuids: string[],
  date: string
): Promise<IntraDaySummary> {
  const pool = getTipseePool();

  const [summaryResult, categoryResult] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*) as total_checks,
        COALESCE(SUM(guest_count), 0) as total_covers,
        COALESCE(SUM(sub_total), 0) as gross_sales,
        COALESCE(SUM(revenue_total), 0) as net_sales,
        COALESCE(SUM(comp_total), 0) as comps_total,
        COALESCE(SUM(void_total), 0) as voids_total
      FROM public.tipsee_checks
      WHERE location_uuid = ANY($1) AND trading_day = $2`,
      [locationUuids, date]
    ),
    pool.query(
      `SELECT
        CASE
          WHEN LOWER(COALESCE(parent_category, '')) LIKE '%bev%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%wine%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%beer%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%liquor%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%cocktail%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%spirit%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%draft%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%drink%'
          THEN 'Beverage'
          WHEN LOWER(COALESCE(parent_category, '')) LIKE '%food%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%entree%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%appetizer%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%dessert%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%salad%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%soup%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%side%'
            OR COALESCE(parent_category, '') = ''
          THEN 'Food'
          ELSE 'Other'
        END as sales_type,
        COALESCE(SUM(price * quantity), 0) as total
      FROM public.tipsee_check_items
      WHERE location_uuid = ANY($1) AND trading_day = $2
      GROUP BY sales_type`,
      [locationUuids, date]
    ),
  ]);

  const summary = summaryResult.rows[0]
    ? cleanRow(summaryResult.rows[0])
    : { total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0, comps_total: 0, voids_total: 0 };

  // Item-level gross per category (used as distribution weights)
  let grossFood = 0, grossBev = 0, grossOther = 0;
  for (const row of categoryResult.rows) {
    const clean = cleanRow(row);
    if (clean.sales_type === 'Food') grossFood = clean.total;
    else if (clean.sales_type === 'Beverage') grossBev = clean.total;
    else grossOther = clean.total;
  }

  // Proportionally allocate check-level net_sales across categories.
  // Item prices don't sum to check revenue (packages, minimums, pricing structures).
  const grossTotal = grossFood + grossBev + grossOther;
  const netSales = summary.net_sales;
  const ratio = grossTotal > 0 && netSales > 0 ? netSales / grossTotal : 1;

  return {
    total_checks: summary.total_checks,
    total_covers: summary.total_covers,
    gross_sales: summary.gross_sales,
    net_sales: netSales,
    food_sales: Math.round(grossFood * ratio * 100) / 100,
    beverage_sales: Math.round(grossBev * ratio * 100) / 100,
    other_sales: Math.round(grossOther * ratio * 100) / 100,
    comps_total: summary.comps_total,
    voids_total: summary.voids_total,
  };
}

/**
 * Blended intra-day summary: closed check revenue + open tab item revenue.
 *
 * - Closed checks (close_time IS NOT NULL): use authoritative revenue_total
 * - Open tabs (items whose check_id has no closed check): sum item prices
 *
 * This true-ups incrementally as each check closes — no need to wait for EOD.
 * Closed checks use the real revenue_total (post-comp, post-void, proper accounting).
 * Open tabs use item-level sums (slightly inflated but real-time).
 */
export async function fetchIntraDayItemSummary(
  locationUuids: string[],
  date: string
): Promise<IntraDaySummary> {
  const pool = getTipseePool();

  // Run three queries in parallel:
  // 1. Closed check totals (authoritative)
  // 2. Open tab item totals (items on checks not yet closed or not yet in tipsee_checks)
  // 3. Category breakdown from ALL items (for food/bev split)
  const [closedResult, openResult, categoryResult] = await Promise.all([
    // 1. Closed checks — authoritative revenue_total
    pool.query(
      `SELECT
        COUNT(*) as closed_checks,
        COALESCE(SUM(guest_count), 0) as closed_covers,
        COALESCE(SUM(sub_total), 0) as closed_gross,
        COALESCE(SUM(revenue_total), 0) as closed_net,
        COALESCE(SUM(comp_total), 0) as closed_comps,
        COALESCE(SUM(void_total), 0) as closed_voids
      FROM public.tipsee_checks
      WHERE location_uuid = ANY($1) AND trading_day = $2
        AND close_time IS NOT NULL`,
      [locationUuids, date]
    ),
    // 2. Open tab items — items on checks that are still open or don't exist yet
    pool.query(
      `SELECT
        COUNT(DISTINCT ci.check_id) as open_checks,
        COALESCE(SUM(ci.price * ci.quantity), 0) as open_gross,
        COALESCE(SUM(ci.comp_total), 0) as open_comps,
        COALESCE(SUM(ci.void_value), 0) as open_voids
      FROM public.tipsee_check_items ci
      LEFT JOIN public.tipsee_checks c
        ON ci.check_id = c.id AND c.trading_day = $2 AND c.close_time IS NOT NULL
      WHERE ci.location_uuid = ANY($1) AND ci.trading_day = $2
        AND c.id IS NULL`,
      [locationUuids, date]
    ),
    // 3. Category breakdown from ALL items (food/bev split)
    pool.query(
      `SELECT
        CASE
          WHEN LOWER(COALESCE(parent_category, '')) LIKE '%bev%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%wine%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%beer%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%liquor%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%cocktail%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%spirit%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%draft%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%drink%'
          THEN 'Beverage'
          WHEN LOWER(COALESCE(parent_category, '')) LIKE '%food%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%entree%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%appetizer%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%dessert%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%salad%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%soup%'
            OR LOWER(COALESCE(parent_category, '')) LIKE '%side%'
          THEN 'Food'
          ELSE 'Other'
        END as sales_type,
        COALESCE(SUM(price * quantity), 0) as total
      FROM public.tipsee_check_items
      WHERE location_uuid = ANY($1) AND trading_day = $2
      GROUP BY sales_type`,
      [locationUuids, date]
    ),
  ]);

  const closed = closedResult.rows[0] ? cleanRow(closedResult.rows[0]) : { closed_checks: 0, closed_covers: 0, closed_gross: 0, closed_net: 0, closed_comps: 0, closed_voids: 0 };
  const open = openResult.rows[0] ? cleanRow(openResult.rows[0]) : { open_checks: 0, open_gross: 0, open_comps: 0, open_voids: 0 };

  const openNet = (open.open_gross || 0) - (open.open_comps || 0) - (open.open_voids || 0);

  const totalChecks = closed.closed_checks + open.open_checks;
  const totalCovers = closed.closed_covers; // only closed checks have guest_count
  const totalGross = closed.closed_gross + (open.open_gross || 0);
  const totalNet = closed.closed_net + Math.max(openNet, 0);
  const totalComps = closed.closed_comps + (open.open_comps || 0);
  const totalVoids = closed.closed_voids + (open.open_voids || 0);

  if (totalNet === 0 && totalChecks === 0) {
    return { total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0, food_sales: 0, beverage_sales: 0, other_sales: 0, comps_total: 0, voids_total: 0 };
  }

  // Category split from items (used as distribution weights for the blended net)
  let grossFood = 0, grossBev = 0, grossOther = 0;
  for (const row of categoryResult.rows) {
    const clean = cleanRow(row);
    if (clean.sales_type === 'Food') grossFood = clean.total;
    else if (clean.sales_type === 'Beverage') grossBev = clean.total;
    else grossOther = clean.total;
  }
  const grossTotal = grossFood + grossBev + grossOther;
  const ratio = grossTotal > 0 && totalNet > 0 ? totalNet / grossTotal : 1;

  return {
    total_checks: totalChecks,
    total_covers: totalCovers,
    gross_sales: totalGross,
    net_sales: Math.round(totalNet * 100) / 100,
    food_sales: Math.round(grossFood * ratio * 100) / 100,
    beverage_sales: Math.round(grossBev * ratio * 100) / 100,
    other_sales: Math.round(grossOther * ratio * 100) / 100,
    comps_total: totalComps,
    voids_total: totalVoids,
  };
}

// ============================================================================
// SIMPHONY POS SUPPORT (Oracle Simphony — used by Dallas, etc.)
// ============================================================================

/**
 * Detect POS type for a set of location UUIDs.
 * Returns 'simphony' | 'upserve' | 'avero'.
 */
export async function getPosTypeForLocations(
  locationUuids: string[]
): Promise<'simphony' | 'upserve' | 'avero'> {
  if (locationUuids.length === 0) return 'upserve';

  const pool = getTipseePool();
  const result = await pool.query(
    `SELECT pos_type FROM public.general_locations
     WHERE uuid = ANY($1::uuid[]) AND pos_type IS NOT NULL
     LIMIT 1`,
    [locationUuids]
  );

  if (result.rows.length > 0) {
    const pt = result.rows[0].pos_type;
    if (pt === 'simphony') return 'simphony';
    if (pt === 'avero') return 'avero';
  }
  return 'upserve';
}

/**
 * Fetch running totals for Simphony POS venues (e.g. Dallas).
 * Sums across all revenue centers. Uses revenue_center_name to approximate
 * food/bev split: centers containing "bar" → beverage, everything else → food.
 */
export async function fetchSimphonyIntraDaySummary(
  locationUuids: string[],
  date: string
): Promise<IntraDaySummary> {
  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
      COALESCE(SUM(check_count), 0) as total_checks,
      COALESCE(SUM(guest_count), 0) as total_covers,
      COALESCE(SUM(gross_sales), 0) as gross_sales,
      COALESCE(SUM(net_sales), 0) as net_sales,
      ABS(COALESCE(SUM(discount_total), 0)) as comps_total,
      ABS(COALESCE(SUM(void_total), 0)) as voids_total,
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
    [locationUuids, date]
  );

  const row = result.rows[0] ? cleanRow(result.rows[0]) : {
    total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0,
    comps_total: 0, voids_total: 0, beverage_sales: 0, food_sales: 0,
  };

  return {
    total_checks: row.total_checks,
    total_covers: row.total_covers,
    gross_sales: row.gross_sales,
    net_sales: row.net_sales,
    food_sales: row.food_sales,
    beverage_sales: row.beverage_sales,
    other_sales: 0,
    comps_total: row.comps_total,
    voids_total: row.voids_total,
  };
}

// ============================================================================
// SIMPHONY ITEM-LEVEL QUERY — tipsee_simphony_sales_items (per-check items)
// ============================================================================

/**
 * Fetch intra-day summary from Simphony per-item data.
 * TipSee syncs item-level data (tipsee_simphony_sales_items) which may be
 * available even when the aggregate table (tipsee_simphony_sales) is not.
 * Uses menu dimensions to classify food vs beverage.
 */
export async function fetchSimphonyItemSummary(
  locationUuids: string[],
  date: string
): Promise<IntraDaySummary> {
  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
      COUNT(DISTINCT i.check_number) as total_checks,
      COUNT(DISTINCT i.check_number) as total_covers,
      COALESCE(SUM(i.sales_total), 0) as gross_sales,
      COALESCE(SUM(i.sales_total) + SUM(i.discount_total), 0) as net_sales,
      ABS(COALESCE(SUM(i.discount_total), 0)) as comps_total,
      0 as voids_total,
      COALESCE(SUM(CASE
        WHEN LOWER(COALESCE(m.major_group_name, '')) IN ('beverage', 'beverages', 'bar', 'drinks', 'wine', 'beer', 'liquor')
          OR i.revenue_center_number = 2
        THEN i.sales_total ELSE 0 END), 0) as beverage_sales,
      COALESCE(SUM(CASE
        WHEN LOWER(COALESCE(m.major_group_name, '')) NOT IN ('beverage', 'beverages', 'bar', 'drinks', 'wine', 'beer', 'liquor')
          AND i.revenue_center_number != 2
        THEN i.sales_total ELSE 0 END), 0) as food_sales
    FROM public.tipsee_simphony_sales_items i
    LEFT JOIN public.tipsee_simphony_menu_dimensions m
      ON m.location_uuid = i.location_uuid AND m.menu_item_number = i.menu_item_number
    WHERE i.location_uuid = ANY($1) AND i.trading_day = $2`,
    [locationUuids, date]
  );

  const row = result.rows[0] ? cleanRow(result.rows[0]) : {
    total_checks: 0, total_covers: 0, gross_sales: 0, net_sales: 0,
    comps_total: 0, voids_total: 0, beverage_sales: 0, food_sales: 0,
  };

  return {
    total_checks: row.total_checks,
    total_covers: row.total_covers,
    gross_sales: row.gross_sales,
    net_sales: row.net_sales,
    food_sales: row.food_sales,
    beverage_sales: row.beverage_sales,
    other_sales: 0,
    comps_total: row.comps_total,
    voids_total: row.voids_total,
  };
}

// ============================================================================
// SIMPHONY BI API — Direct Oracle Simphony polling (bypasses TipSee batch)
// ============================================================================

/**
 * Fetch intra-day sales summary directly from the Simphony BI API.
 * Used for Simphony venues (e.g. Dallas) where TipSee data is batch-delayed.
 * Returns the same IntraDaySummary interface for seamless integration.
 *
 * Note: Takes venueId (not locationUuids) because it uses the
 * simphony_bi_location_mapping table.
 */
export async function fetchSimphonyBIIntraDaySummary(
  venueId: string,
  businessDate: string
): Promise<IntraDaySummary> {
  // Lazy imports to avoid circular deps and keep TipSee module lightweight
  // when Simphony BI is not configured
  const { getSimphonyLocationMapping, getValidIdToken, getSimphonyConfig } =
    await import('@/lib/database/simphony-tokens');
  const { getOperationsDailyTotals } =
    await import('@/lib/integrations/simphony-bi');

  const mapping = await getSimphonyLocationMapping(venueId);
  if (!mapping) {
    throw new Error(`No Simphony BI mapping for venue ${venueId}`);
  }

  const idToken = await getValidIdToken(mapping.org_identifier);
  const config = await getSimphonyConfig(mapping.org_identifier);
  const totals = await getOperationsDailyTotals(config, idToken, mapping.loc_ref, businessDate);

  const barRCs = new Set(mapping.bar_revenue_centers || [2]);

  let netSales = 0;
  let checks = 0;
  let covers = 0;
  let voids = 0;
  let comps = 0;
  let foodSales = 0;
  let bevSales = 0;

  for (const rc of totals.revenueCenters || []) {
    const rcNet = rc.netSlsTtl || 0;
    netSales += rcNet;
    checks += rc.chkCnt || 0;
    covers += rc.gstCnt || 0;
    voids += Math.abs(rc.vdTtl || 0);
    comps += Math.abs(rc.itmDscTtl || 0) + Math.abs(rc.subDscTtl || 0);

    if (barRCs.has(rc.rvcNum)) {
      bevSales += rcNet;
    } else {
      foodSales += rcNet;
    }
  }

  return {
    total_checks: checks,
    total_covers: covers,
    gross_sales: netSales + comps + voids,
    net_sales: netSales,
    food_sales: foodSales,
    beverage_sales: bevSales,
    other_sales: 0,
    comps_total: comps,
    voids_total: voids,
  };
}

// ============================================================================
// COMP BY REASON — Breakdown of comps grouped by voidcomp_reason_text
// ============================================================================

export interface CompByReason {
  reason: string;
  count: number;
  total: number;
}

export async function fetchCompsByReason(
  locationUuids: string[],
  date: string,
  venueId?: string
): Promise<CompByReason[]> {
  if (locationUuids.length === 0) return [];

  const posType = await getPosTypeForLocations(locationUuids);
  if (posType === 'simphony') {
    return fetchSimphonyCompsByReason(locationUuids, date, venueId);
  }

  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
      COALESCE(NULLIF(TRIM(voidcomp_reason_text), ''), 'No Reason') as reason,
      COUNT(*)::int as count,
      COALESCE(SUM(comp_total), 0) as total
    FROM public.tipsee_checks
    WHERE location_uuid = ANY($1) AND trading_day = $2 AND comp_total > 0
    GROUP BY COALESCE(NULLIF(TRIM(voidcomp_reason_text), ''), 'No Reason')
    ORDER BY total DESC`,
    [locationUuids, date]
  );

  return result.rows.map(r => ({
    reason: r.reason,
    count: parseInt(r.count) || 0,
    total: parseFloat(r.total) || 0,
  }));
}

/**
 * Simphony comp breakdown — tries BI API for per-discount-type names,
 * falls back to TipSee aggregate discount_total by revenue center.
 */
async function fetchSimphonyCompsByReason(
  locationUuids: string[],
  date: string,
  venueId?: string
): Promise<CompByReason[]> {
  // Try Simphony BI API for per-discount-type breakdown
  if (venueId) {
    try {
      const { getCachedDiscountDimensions, getSimphonyLocationMapping, getValidIdToken, getSimphonyConfig } = await import('@/lib/database/simphony-tokens');
      const { getDiscountDailyTotals } = await import('@/lib/integrations/simphony-bi');

      const mapping = await getSimphonyLocationMapping(venueId);
      if (mapping) {
        const [dimMap, idToken, config] = await Promise.all([
          getCachedDiscountDimensions(venueId),
          getValidIdToken(mapping.org_identifier),
          getSimphonyConfig(mapping.org_identifier),
        ]);

        const totals = await getDiscountDailyTotals(config, idToken, mapping.loc_ref, date);

        // Aggregate across all revenue centers by discount number
        const byDiscount = new Map<number, { ttl: number; cnt: number }>();
        for (const rc of totals.revenueCenters || []) {
          for (const d of rc.discounts || []) {
            const existing = byDiscount.get(d.dscNum) || { ttl: 0, cnt: 0 };
            existing.ttl += Math.abs(d.ttl || 0);
            existing.cnt += d.cnt || 0;
            byDiscount.set(d.dscNum, existing);
          }
        }

        if (byDiscount.size > 0) {
          const results: CompByReason[] = [];
          for (const [dscNum, { ttl, cnt }] of byDiscount) {
            const name = dimMap?.get(dscNum) || `Discount #${dscNum}`;
            results.push({ reason: name, count: cnt, total: ttl });
          }
          return results.sort((a, b) => b.total - a.total);
        }
      }
    } catch (err: any) {
      console.warn(`[comps] Simphony BI discount breakdown failed for ${venueId}: ${err.message}`);
      // Fall through to TipSee aggregate
    }
  }

  // Fallback: TipSee aggregate discount_total by revenue center
  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
      COALESCE(NULLIF(TRIM(revenue_center_name), ''), 'RC ' || revenue_center_number) as rc_name,
      check_count as count,
      ABS(COALESCE(discount_total, 0)) as total
    FROM public.tipsee_simphony_sales
    WHERE location_uuid = ANY($1) AND trading_day = $2 AND discount_total != 0
    ORDER BY ABS(discount_total) DESC`,
    [locationUuids, date]
  );

  return result.rows.map(r => ({
    reason: `Discounts - ${r.rc_name}`,
    count: parseInt(r.count) || 1,
    total: parseFloat(r.total) || 0,
  }));
}

/**
 * Aggregate comps by reason over a date range (for period views).
 */
export async function fetchCompsByReasonForRange(
  locationUuids: string[],
  startDate: string,
  endDate: string
): Promise<CompByReason[]> {
  if (locationUuids.length === 0) return [];

  const posType = await getPosTypeForLocations(locationUuids);
  if (posType === 'simphony') {
    const pool = getTipseePool();
    const result = await pool.query(
      `SELECT
        COALESCE(NULLIF(TRIM(revenue_center_name), ''), 'RC ' || revenue_center_number) as rc_name,
        SUM(check_count)::int as count,
        ABS(COALESCE(SUM(discount_total), 0)) as total
      FROM public.tipsee_simphony_sales
      WHERE location_uuid = ANY($1)
        AND trading_day >= $2 AND trading_day <= $3
        AND discount_total != 0
      GROUP BY COALESCE(NULLIF(TRIM(revenue_center_name), ''), 'RC ' || revenue_center_number)
      ORDER BY ABS(SUM(discount_total)) DESC`,
      [locationUuids, startDate, endDate]
    );
    return result.rows.map(r => ({
      reason: `Discounts - ${r.rc_name}`,
      count: parseInt(r.count) || 1,
      total: parseFloat(r.total) || 0,
    }));
  }

  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
      COALESCE(NULLIF(TRIM(voidcomp_reason_text), ''), 'No Reason') as reason,
      COUNT(*)::int as count,
      COALESCE(SUM(comp_total), 0) as total
    FROM public.tipsee_checks
    WHERE location_uuid = ANY($1)
      AND trading_day >= $2 AND trading_day <= $3
      AND comp_total > 0
    GROUP BY COALESCE(NULLIF(TRIM(voidcomp_reason_text), ''), 'No Reason')
    ORDER BY total DESC`,
    [locationUuids, startDate, endDate]
  );

  return result.rows.map(r => ({
    reason: r.reason,
    count: parseInt(r.count) || 0,
    total: parseFloat(r.total) || 0,
  }));
}

// ============================================================================
// COMP EXCEPTION DETECTION
// Based on h.wood Group Comps, Voids and Discounts SOP
// ============================================================================

// Approved comp reason codes from SOP
const APPROVED_COMP_REASONS = [
  // Drink Tickets
  'drink ticket', 'drink tickets',
  // Promoter/Customer Development
  'promoter', 'promoter dinner', 'customer development', 'cust dev',
  // Guest Recovery
  'guest recovery', 'recovery',
  // Black Card
  'black card', 'blackcard',
  // Employee/Staff Discounts
  'staff 10%', 'staff 20%', 'staff 25%', 'staff 30%', 'staff 50%',
  'staff10', 'staff20', 'staff25', 'staff30', 'staff50',
  'employee discount', 'employee', 'emp discount',
  // Executive/Partner Comps (these are typically names, handled separately)
  'executive comp', 'partner comp', 'exec comp',
  // Goodwill
  'goodwill', 'good will',
  // DNL (Did Not Like)
  'dnl', 'did not like', 'didnt like',
  // Spill
  'spill', 'spilled', 'broken',
  // FOH Mistake
  'foh mistake', 'foh', 'front of house', 'server error', 'server mistake',
  // BOH Mistake
  'boh mistake', 'boh', 'back of house', 'kitchen mistake', 'kitchen error', 'wrong temp',
  // Barbuy
  'barbuy', 'bar buy',
  // Performer
  'performer', 'band', 'dj',
  // Media/PR/Celebrity
  'media', 'pr', 'celebrity', 'press', 'media/pr', 'media/pr/celebrity',
  // Manager Meal
  'manager meal', 'mgr meal', 'manager', 'management meal',
];

// Reasons that indicate promoter-related comps
const PROMOTER_REASONS = [
  'promoter', 'promoter dinner', 'customer development', 'cust dev',
];

export type CompExceptionSeverity = 'critical' | 'warning' | 'info';

export type CompExceptionType =
  | 'unapproved_reason'
  | 'missing_reason'
  | 'high_value'
  | 'high_comp_pct'
  | 'promoter_item_mismatch'
  | 'daily_comp_over_budget';

export interface CompException {
  type: CompExceptionType;
  severity: CompExceptionSeverity;
  check_id: string;
  table_name: string;
  server: string;
  comp_total: number;
  check_total: number;
  reason: string;
  comped_items: Array<{ name: string; quantity: number; amount: number }>;
  message: string;
  details: string;
}

export interface CompExceptionSummary {
  date: string;
  total_comps: number;
  net_sales: number;
  comp_pct: number;
  comp_pct_status: 'ok' | 'warning' | 'critical';
  exception_count: number;
  critical_count: number;
  warning_count: number;
}

export interface CompExceptionsResult {
  summary: CompExceptionSummary;
  exceptions: CompException[];
}

// Configuration thresholds
const COMP_THRESHOLDS = {
  HIGH_VALUE_COMP: 200, // Flag individual comps over $200
  HIGH_COMP_PCT_OF_CHECK: 0.5, // Flag checks where comp > 50% of total
  HIGH_COMP_PCT_MIN_AMOUNT: 100, // Only flag high % comps if they're over $100 (avoids split-check false positives)
  DAILY_COMP_PCT_WARNING: 0.02, // 2% of net sales
  DAILY_COMP_PCT_CRITICAL: 0.03, // 3% of net sales
};

function isApprovedReason(reason: string, approvedReasons?: Array<{ name: string }>): boolean {
  const normalized = reason.toLowerCase().trim();
  const compacted = normalized.replace(/\s+/g, ''); // "good will" → "goodwill"
  const reasonList = approvedReasons
    ? approvedReasons.map(r => r.name.toLowerCase())
    : APPROVED_COMP_REASONS;

  return reasonList.some(approved => {
    const approvedCompacted = approved.replace(/\s+/g, '');
    return normalized.includes(approved) || approved.includes(normalized)
      || compacted.includes(approvedCompacted) || approvedCompacted.includes(compacted);
  });
}

function isPromoterReason(reason: string): boolean {
  const normalized = reason.toLowerCase().trim();
  return PROMOTER_REASONS.some(promo =>
    normalized.includes(promo) || promo.includes(normalized)
  );
}

function hasPromoterItems(items: Array<{ name: string }>): boolean {
  return items.some((item: { name: string }) =>
    item.name.toLowerCase().includes('promo') ||
    item.name.toLowerCase().includes('promoter')
  );
}

export async function fetchCompExceptions(
  date: string,
  locationUuid: string,
  settings?: {
    approved_reasons?: Array<{ name: string }>;
    high_value_comp_threshold?: number;
    high_comp_pct_threshold?: number;
    daily_comp_pct_warning?: number;
    daily_comp_pct_critical?: number;
  }
): Promise<CompExceptionsResult> {
  // Route Simphony venues to aggregate-only exception detection
  const posType = await getPosTypeForLocations([locationUuid]);
  if (posType === 'simphony') {
    return fetchSimphonyCompExceptions(date, locationUuid, settings);
  }

  const pool = getTipseePool();
  const exceptions: CompException[] = [];

  // Use settings or fallback to defaults
  const thresholds = {
    highValue: settings?.high_value_comp_threshold ?? COMP_THRESHOLDS.HIGH_VALUE_COMP,
    highCompPct: settings?.high_comp_pct_threshold ?? COMP_THRESHOLDS.HIGH_COMP_PCT_OF_CHECK,
    dailyWarning: settings?.daily_comp_pct_warning ?? COMP_THRESHOLDS.DAILY_COMP_PCT_WARNING,
    dailyCritical: settings?.daily_comp_pct_critical ?? COMP_THRESHOLDS.DAILY_COMP_PCT_CRITICAL,
  };

  // Get daily summary AND all comps in parallel
  const [summaryResult, compsResult] = await Promise.all([
    pool.query(
      `SELECT
        SUM(revenue_total) as net_sales,
        SUM(comp_total) as total_comps
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2`,
      [locationUuid, date]
    ),
    pool.query(
      `SELECT DISTINCT
        c.id as check_id,
        c.table_name,
        c.employee_name as server,
        c.guest_count as covers,
        GREATEST(c.comp_total, COALESCE(item_comps.total, 0)) as comp_total,
        c.revenue_total as check_total,
        COALESCE(NULLIF(c.voidcomp_reason_text, ''), '') as reason
      FROM public.tipsee_checks c
      LEFT JOIN LATERAL (
        SELECT SUM(comp_total) as total
        FROM public.tipsee_check_items
        WHERE check_id = c.id AND comp_total > 0
      ) item_comps ON true
      WHERE c.location_uuid = $1 AND c.trading_day = $2
        AND (c.comp_total > 0 OR item_comps.total > 0)
      ORDER BY GREATEST(c.comp_total, COALESCE(item_comps.total, 0)) DESC`,
      [locationUuid, date]
    ),
  ]);

  const dailySummary = summaryResult.rows[0] || { net_sales: 0, total_comps: 0 };
  const netSales = parseFloat(dailySummary.net_sales) || 0;
  const totalComps = parseFloat(dailySummary.total_comps) || 0;
  const compPct = netSales > 0 ? totalComps / netSales : 0;

  // Batch fetch ALL comp items in 1 query (eliminates N+1)
  const compCheckIds = compsResult.rows.map((r: any) => r.check_id);
  const compItemsMap = new Map<string, Array<{ name: string; quantity: number; amount: number }>>();
  if (compCheckIds.length > 0) {
    const itemsResult = await pool.query(
      `SELECT check_id, name, quantity, comp_total as amount
       FROM public.tipsee_check_items
       WHERE check_id = ANY($1::text[]) AND comp_total > 0
       ORDER BY check_id, comp_total DESC`,
      [compCheckIds]
    );
    for (const item of itemsResult.rows) {
      const arr = compItemsMap.get(item.check_id) || [];
      arr.push({
        name: item.name,
        quantity: parseFloat(item.quantity) || 1,
        amount: parseFloat(item.amount) || 0,
      });
      compItemsMap.set(item.check_id, arr);
    }
  }

  for (const comp of compsResult.rows) {
    const checkId = comp.check_id;
    const compTotal = parseFloat(comp.comp_total) || 0;
    const checkTotal = parseFloat(comp.check_total) || 0;
    const reason = comp.reason || '';

    const compedItems = compItemsMap.get(checkId) || [];

    const baseException = {
      check_id: checkId,
      table_name: comp.table_name || 'Unknown',
      server: comp.server || 'Unknown',
      comp_total: compTotal,
      check_total: checkTotal,
      reason: reason || 'Unknown',
      comped_items: compedItems,
    };

    // Check 1: Missing reason
    if (!reason || reason.toLowerCase() === 'unknown') {
      exceptions.push({
        ...baseException,
        type: 'missing_reason',
        severity: 'critical',
        message: 'Comp has no reason code',
        details: `$${compTotal.toFixed(2)} comped with no reason specified`,
      });
      continue; // Skip other checks for this comp
    }

    // Check 2: Unapproved reason
    if (!isApprovedReason(reason, settings?.approved_reasons)) {
      exceptions.push({
        ...baseException,
        type: 'unapproved_reason',
        severity: 'critical',
        message: `"${reason}" is not an approved comp reason`,
        details: `Reason "${reason}" not found in SOP approved list`,
      });
    }

    // Check 3: Promoter items with non-promoter reason
    if (hasPromoterItems(compedItems) && !isPromoterReason(reason)) {
      exceptions.push({
        ...baseException,
        type: 'promoter_item_mismatch',
        severity: 'warning',
        message: 'Promoter items comped under non-promoter reason',
        details: `Items contain "promo" but reason is "${reason}" - should this be "Promoter"?`,
      });
    }

    // Check 4: High value comp
    if (compTotal >= thresholds.highValue) {
      // Don't double-flag if already flagged for unapproved reason
      const alreadyFlagged = exceptions.some(
        e => e.check_id === checkId && (e.type === 'unapproved_reason' || e.type === 'missing_reason')
      );
      if (!alreadyFlagged) {
        exceptions.push({
          ...baseException,
          type: 'high_value',
          severity: 'warning',
          message: `High-value comp: $${compTotal.toFixed(2)}`,
          details: `Exceeds $${thresholds.highValue} threshold - manager review recommended`,
        });
      }
    }

    // Check 5: High comp % of check (near-full comp)
    // Only flag if over threshold percentage AND above minimum amount (avoids small split-check false positives)
    if (checkTotal > 0 &&
        compTotal / checkTotal > thresholds.highCompPct &&
        compTotal >= COMP_THRESHOLDS.HIGH_COMP_PCT_MIN_AMOUNT) {
      const compPctOfCheck = (compTotal / checkTotal * 100).toFixed(0);
      // Don't double-flag if already flagged for other reasons
      const alreadyFlagged = exceptions.some(
        e => e.check_id === checkId &&
          (e.type === 'unapproved_reason' || e.type === 'missing_reason' || e.type === 'high_value')
      );
      if (!alreadyFlagged) {
        exceptions.push({
          ...baseException,
          type: 'high_comp_pct',
          severity: 'warning',
          message: `${compPctOfCheck}% of check comped`,
          details: `$${compTotal.toFixed(2)} of $${checkTotal.toFixed(2)} total - near-full comp`,
        });
      }
    }
  }

  // Determine daily comp % status
  let compPctStatus: 'ok' | 'warning' | 'critical' = 'ok';
  if (compPct >= thresholds.dailyCritical) {
    compPctStatus = 'critical';
  } else if (compPct >= thresholds.dailyWarning) {
    compPctStatus = 'warning';
  }

  const summary: CompExceptionSummary = {
    date,
    total_comps: totalComps,
    net_sales: netSales,
    comp_pct: compPct * 100,
    comp_pct_status: compPctStatus,
    exception_count: exceptions.length,
    critical_count: exceptions.filter(e => e.severity === 'critical').length,
    warning_count: exceptions.filter(e => e.severity === 'warning').length,
  };

  // Sort exceptions: critical first, then by comp amount
  exceptions.sort((a, b) => {
    if (a.severity === 'critical' && b.severity !== 'critical') return -1;
    if (a.severity !== 'critical' && b.severity === 'critical') return 1;
    return b.comp_total - a.comp_total;
  });

  return { summary, exceptions };
}

/**
 * Simphony comp exceptions — aggregate-only detection.
 * Simphony has no per-check comp detail, only revenue-center-level discount_total.
 * We can only check daily comp % against thresholds.
 */
async function fetchSimphonyCompExceptions(
  date: string,
  locationUuid: string,
  settings?: {
    approved_reasons?: Array<{ name: string }>;
    high_value_comp_threshold?: number;
    high_comp_pct_threshold?: number;
    daily_comp_pct_warning?: number;
    daily_comp_pct_critical?: number;
  }
): Promise<CompExceptionsResult> {
  const pool = getTipseePool();

  const thresholds = {
    highValue: settings?.high_value_comp_threshold ?? COMP_THRESHOLDS.HIGH_VALUE_COMP,
    dailyWarning: settings?.daily_comp_pct_warning ?? COMP_THRESHOLDS.DAILY_COMP_PCT_WARNING,
    dailyCritical: settings?.daily_comp_pct_critical ?? COMP_THRESHOLDS.DAILY_COMP_PCT_CRITICAL,
  };

  const result = await pool.query(
    `SELECT
      COALESCE(SUM(net_sales), 0) as net_sales,
      ABS(COALESCE(SUM(discount_total), 0)) as total_comps
    FROM public.tipsee_simphony_sales
    WHERE location_uuid = $1 AND trading_day = $2`,
    [locationUuid, date]
  );

  const row = result.rows[0] || { net_sales: 0, total_comps: 0 };
  const netSales = parseFloat(row.net_sales) || 0;
  const totalComps = parseFloat(row.total_comps) || 0;
  const compPct = netSales > 0 ? totalComps / netSales : 0;

  const exceptions: CompException[] = [];

  // Only aggregate-level checks are possible for Simphony
  if (totalComps >= thresholds.highValue) {
    exceptions.push({
      type: 'high_value',
      severity: 'warning',
      check_id: 'aggregate',
      table_name: 'All',
      server: 'Simphony Aggregate',
      comp_total: totalComps,
      check_total: netSales,
      reason: 'Discounts (Simphony)',
      comped_items: [],
      message: `Daily discounts: $${totalComps.toFixed(2)}`,
      details: `Simphony aggregate discount exceeds $${thresholds.highValue} threshold`,
    });
  }

  let compPctStatus: 'ok' | 'warning' | 'critical' = 'ok';
  if (compPct >= thresholds.dailyCritical) {
    compPctStatus = 'critical';
  } else if (compPct >= thresholds.dailyWarning) {
    compPctStatus = 'warning';
  }

  return {
    summary: {
      date,
      total_comps: totalComps,
      net_sales: netSales,
      comp_pct: compPct * 100,
      comp_pct_status: compPctStatus,
      exception_count: exceptions.length,
      critical_count: exceptions.filter(e => e.severity === 'critical').length,
      warning_count: exceptions.filter(e => e.severity === 'warning').length,
    },
    exceptions,
  };
}

// ============================================================================
// CHECK DRILL-DOWN (on-demand, user-facing)
// ============================================================================

export interface CheckSummary {
  id: string;
  table_name: string;
  employee_name: string;
  guest_count: number;
  sub_total: number;
  revenue_total: number;
  comp_total: number;
  void_total: number;
  open_time: string;
  close_time: string | null;
  is_open: boolean;
  payment_total: number;
  tip_total: number;
}

/**
 * Fetch open check summaries built from items (for checks not yet in tipsee_checks).
 * Mirrors the blended query logic used in sales pace.
 */
async function fetchOpenCheckSummariesFromItems(
  locationUuids: string[],
  date: string
): Promise<CheckSummary[]> {
  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
      ci.check_id as id,
      COALESCE(MIN(ci.table_name), 'Unknown') as table_name,
      COALESCE(MIN(ci.employee_name), 'Unknown') as employee_name,
      0 as guest_count,
      COALESCE(SUM(ci.price * ci.quantity), 0) as sub_total,
      COALESCE(SUM(ci.price * ci.quantity), 0) - COALESCE(SUM(ci.comp_total), 0) - COALESCE(SUM(ci.void_value), 0) as revenue_total,
      COALESCE(SUM(ci.comp_total), 0) as comp_total,
      COALESCE(SUM(ci.void_value), 0) as void_total,
      MIN(ci.created_at) as open_time,
      NULL as close_time,
      true as is_open,
      0 as payment_total,
      0 as tip_total
    FROM public.tipsee_check_items ci
    LEFT JOIN public.tipsee_checks c
      ON ci.check_id = c.id AND c.trading_day = $2
    WHERE ci.location_uuid = ANY($1) AND ci.trading_day = $2
      AND c.id IS NULL  -- only items from checks not yet in tipsee_checks
    GROUP BY ci.check_id`,
    [locationUuids, date]
  );

  return result.rows.map(row => {
    const r = cleanRow(row);
    return {
      id: r.id,
      table_name: r.table_name || 'Unknown',
      employee_name: r.employee_name || 'Unknown',
      guest_count: r.guest_count || 0,
      sub_total: r.sub_total || 0,
      revenue_total: r.revenue_total || 0,
      comp_total: r.comp_total || 0,
      void_total: r.void_total || 0,
      open_time: r.open_time,
      close_time: r.close_time || null,
      is_open: r.is_open,
      payment_total: r.payment_total || 0,
      tip_total: r.tip_total || 0,
    } as CheckSummary;
  });
}

/**
 * Fetch all checks for a venue on a given date.
 * Includes both:
 * - Checks in tipsee_checks (open and closed)
 * - Open checks built from items (not yet in tipsee_checks)
 */
export async function fetchChecksForDate(
  locationUuids: string[],
  date: string,
  limit = 50,
  offset = 0
): Promise<{ checks: CheckSummary[]; total: number }> {
  const pool = getTipseePool();

  const baseSql = `SELECT
        c.id,
        c.table_name,
        c.employee_name,
        c.guest_count,
        c.sub_total,
        c.revenue_total,
        c.comp_total,
        c.void_total,
        c.open_time,
        c.close_time,
        (c.close_time IS NULL) as is_open,
        COALESCE(pay.payment_total, 0) as payment_total,
        COALESCE(pay.tip_total, 0) as tip_total
      FROM public.tipsee_checks c
      LEFT JOIN LATERAL (
        SELECT
          SUM(amount) as payment_total,
          SUM(COALESCE(tip_amount, 0)) as tip_total
        FROM public.tipsee_payments
        WHERE check_id = c.id
      ) pay ON true
      WHERE c.location_uuid = ANY($1) AND c.trading_day = $2
      ORDER BY c.open_time DESC`;

  // Always fetch all checks (no limit) when merging with items
  const [result, openChecks] = await Promise.all([
    pool.query(baseSql, [locationUuids, date]),
    fetchOpenCheckSummariesFromItems(locationUuids, date),
  ]);

  // Merge checks from tipsee_checks with virtual open checks from items
  const checksFromTable = result.rows.map(row => {
    const r = cleanRow(row);
    return {
      id: r.id,
      table_name: r.table_name || 'N/A',
      employee_name: r.employee_name || 'Unknown',
      guest_count: r.guest_count || 0,
      sub_total: r.sub_total || 0,
      revenue_total: r.revenue_total || 0,
      comp_total: r.comp_total || 0,
      void_total: r.void_total || 0,
      open_time: r.open_time,
      close_time: r.close_time || null,
      is_open: r.is_open,
      payment_total: r.payment_total || 0,
      tip_total: r.tip_total || 0,
    } as CheckSummary;
  });

  // Combine and sort by open_time DESC
  const allChecks = [...checksFromTable, ...openChecks].sort((a, b) =>
    new Date(b.open_time).getTime() - new Date(a.open_time).getTime()
  );

  // Apply pagination to merged results
  const checks = limit > 0 ? allChecks.slice(offset, offset + limit) : allChecks;

  return { checks, total: allChecks.length };
}

export interface CheckItemDetail {
  name: string;
  category: string;
  parent_category: string;
  quantity: number;
  price: number;
  comp_total: number;
  void_value: number;
  is_beverage: boolean;
}

export interface CheckPaymentDetail {
  cc_name: string | null;
  amount: number;
  tip_amount: number;
}

export interface CheckDetail {
  id: string;
  table_name: string;
  employee_name: string;
  employee_role_name: string;
  guest_count: number;
  sub_total: number;
  revenue_total: number;
  comp_total: number;
  void_total: number;
  open_time: string;
  close_time: string | null;
  voidcomp_reason_text: string;
  items: CheckItemDetail[];
  payments: CheckPaymentDetail[];
}

/**
 * Fetch full detail for a single check: header + items + payments.
 * Three parallel queries to avoid Cartesian product from JOINs.
 */
export async function fetchCheckDetail(
  checkId: string
): Promise<CheckDetail | null> {
  const pool = getTipseePool();
  const BEV_PATTERNS = ['bev', 'wine', 'beer', 'liquor', 'cocktail'];

  const [checkResult, itemsResult, paymentsResult] = await Promise.all([
    pool.query(
      `SELECT id, table_name, employee_name, employee_role_name,
        guest_count, sub_total, revenue_total, comp_total,
        void_total, open_time, close_time, voidcomp_reason_text
      FROM public.tipsee_checks WHERE id = $1`,
      [checkId]
    ),
    pool.query(
      `SELECT name, category, parent_category, quantity, price,
        COALESCE(comp_total, 0) as comp_total,
        COALESCE(void_value, 0) as void_value
      FROM public.tipsee_check_items
      WHERE check_id = $1
      ORDER BY parent_category, name`,
      [checkId]
    ),
    pool.query(
      `SELECT cc_name, amount, COALESCE(tip_amount, 0) as tip_amount
      FROM public.tipsee_payments
      WHERE check_id = $1
      ORDER BY amount DESC`,
      [checkId]
    ),
  ]);

  if (checkResult.rows.length === 0) return null;

  const c = cleanRow(checkResult.rows[0]);

  return {
    id: c.id,
    table_name: c.table_name || 'N/A',
    employee_name: c.employee_name || 'Unknown',
    employee_role_name: c.employee_role_name || '',
    guest_count: c.guest_count || 0,
    sub_total: c.sub_total || 0,
    revenue_total: c.revenue_total || 0,
    comp_total: c.comp_total || 0,
    void_total: c.void_total || 0,
    open_time: c.open_time,
    close_time: c.close_time || null,
    voidcomp_reason_text: c.voidcomp_reason_text || '',
    items: itemsResult.rows.map(row => {
      const r = cleanRow(row);
      const parentLower = (r.parent_category || '').toLowerCase();
      return {
        name: r.name,
        category: r.category || '',
        parent_category: r.parent_category || 'Other',
        quantity: r.quantity || 1,
        price: r.price || 0,
        comp_total: r.comp_total || 0,
        void_value: r.void_value || 0,
        is_beverage: BEV_PATTERNS.some(p => parentLower.includes(p)),
      };
    }),
    payments: paymentsResult.rows.map(row => {
      const r = cleanRow(row);
      return {
        cc_name: r.cc_name || null,
        amount: r.amount || 0,
        tip_amount: r.tip_amount || 0,
      };
    }),
  };
}

// ============================================================================
// LABOR DATA (from TipSee punches table via 7Shifts)
// ============================================================================

export interface LaborDeptBreakdown {
  hours: number;
  cost: number;
  employee_count: number;
}

export interface LaborSummary {
  total_hours: number;
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  covers_per_labor_hour: number | null;
  employee_count: number;
  punch_count: number;
  foh: LaborDeptBreakdown | null;
  boh: LaborDeptBreakdown | null;
  other: LaborDeptBreakdown | null;
}

/**
 * Fetch daily labor summary from TipSee
 * Primary: tipsee_7shifts_punches (most complete — has all venues + hourly_wage inline)
 * Fallback 1: new_tipsee_punches + wage join (some venues only here)
 * Fallback 2: punches (old table, stale for LA since May 2025)
 */
export async function fetchLaborSummary(
  locationUuid: string,
  date: string,
  netSales: number,
  covers: number
): Promise<LaborSummary | null> {
  const pool = getTipseePool();

  try {
    // Primary: tipsee_7shifts_punches
    // hourly_wage is in cents for some venues (e.g. 2500 = $25) and dollars for others (e.g. 25 = $25)
    // Normalize: values > 100 are cents (divide by 100), values <= 100 are already dollars
    const result = await pool.query(
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
      [locationUuid, date]
    );

    let row = result.rows[0];
    let punchTable = 'tipsee_7shifts_punches';

    // Fallback 1: new_tipsee_punches with wage join
    if (!row || Number(row.punch_count) === 0) {
      const fb1 = await pool.query(
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
        [locationUuid, date]
      );
      if (fb1.rows[0] && Number(fb1.rows[0].punch_count) > 0) {
        row = fb1.rows[0];
        punchTable = 'new_tipsee_punches';
      }
    }

    // Fallback 2: old punches table
    if (!row || Number(row.punch_count) === 0) {
      const fb2 = await pool.query(
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
        [locationUuid, date]
      );
      if (fb2.rows[0] && Number(fb2.rows[0].punch_count) > 0) {
        row = fb2.rows[0];
        punchTable = 'punches';
      }
    }

    if (!row || Number(row.punch_count) === 0) {
      return null;
    }

    const totalHours = Number(row.total_hours) || 0;
    const laborCost = Number(row.labor_cost) || 0;
    const employeeCount = Number(row.employee_count) || 0;
    const punchCount = Number(row.punch_count) || 0;

    // Calculate OT: hours over 8 per employee per day (from same table that had data)
    let otHours = 0;
    if (punchTable === 'tipsee_7shifts_punches') {
      const otResult = await pool.query(
        `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
        FROM public.tipsee_7shifts_punches
        WHERE location_uuid = $1
          AND clocked_in::date = $2::date
          AND clocked_out IS NOT NULL
          AND deleted IS NOT TRUE
        GROUP BY user_id
        HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`,
        [locationUuid, date]
      );
      otHours = otResult.rows.reduce((sum: number, r: any) => sum + Math.max(0, Number(r.daily_hours) - 8), 0);
    } else if (punchTable === 'new_tipsee_punches') {
      const otResult = await pool.query(
        `SELECT user_id, SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) as daily_hours
        FROM public.new_tipsee_punches
        WHERE location_uuid = $1
          AND clocked_in::date = $2::date
          AND clocked_out IS NOT NULL
          AND is_deleted IS NOT TRUE
        GROUP BY user_id
        HAVING SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600) > 8`,
        [locationUuid, date]
      );
      otHours = otResult.rows.reduce((sum: number, r: any) => sum + Math.max(0, Number(r.daily_hours) - 8), 0);
    }

    // FOH/BOH breakdown (only for tipsee_7shifts_punches which has department_id)
    let foh: LaborDeptBreakdown | null = null;
    let boh: LaborDeptBreakdown | null = null;
    let other: LaborDeptBreakdown | null = null;

    if (punchTable === 'tipsee_7shifts_punches') {
      const deptResult = await pool.query(
        `SELECT
          CASE
            WHEN d.name = 'FOH' THEN 'FOH'
            WHEN d.name = 'BOH' THEN 'BOH'
            ELSE 'Other'
          END as dept_group,
          COUNT(DISTINCT p.user_id) as employee_count,
          COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0) as total_hours,
          COALESCE(SUM(
            EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 *
            CASE WHEN COALESCE(p.hourly_wage, 0) > 100 THEN COALESCE(p.hourly_wage, 0) / 100.0 ELSE COALESCE(p.hourly_wage, 0) END
          ), 0) as labor_cost
        FROM public.tipsee_7shifts_punches p
        LEFT JOIN (SELECT DISTINCT ON (id) id, name FROM public.departments) d
          ON d.id = p.department_id
        WHERE p.location_uuid = $1
          AND p.clocked_in::date = $2::date
          AND p.clocked_out IS NOT NULL
          AND p.deleted IS NOT TRUE
        GROUP BY dept_group`,
        [locationUuid, date]
      );

      for (const r of deptResult.rows) {
        const entry: LaborDeptBreakdown = {
          hours: Number(r.total_hours) || 0,
          cost: Number(r.labor_cost) || 0,
          employee_count: Number(r.employee_count) || 0,
        };
        if (r.dept_group === 'FOH') foh = entry;
        else if (r.dept_group === 'BOH') boh = entry;
        else other = entry;
      }
    }

    return {
      total_hours: totalHours,
      labor_cost: laborCost,
      labor_pct: netSales > 0 ? (laborCost / netSales) * 100 : 0,
      splh: totalHours > 0 ? netSales / totalHours : 0,
      ot_hours: otHours,
      covers_per_labor_hour: totalHours > 0 ? covers / totalHours : null,
      employee_count: employeeCount,
      punch_count: punchCount,
      foh,
      boh,
      other,
    };
  } catch (error) {
    console.error('Error fetching TipSee labor data:', error);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RESERVATIONS
// ══════════════════════════════════════════════════════════════════════════

export interface ReservationSummary {
  id: string;
  first_name: string;
  last_name: string;
  party_size: number;
  arrival_time: string | null;
  seated_time: string | null;
  left_time: string | null;
  status: string;
  booked_by: string | null;
  is_vip: boolean;
  tags: string[] | null;
  min_price: number | null;
  reservation_type: string | null;
  venue_seating_area_name: string | null;
  notes: string | null;
  client_requests: string | null;
  table_number: string | null;
}

export async function fetchReservationsForDate(
  locationUuids: string[],
  date: string
): Promise<{ reservations: ReservationSummary[]; total: number }> {
  const pool = getTipseePool();

  const result = await pool.query(
    `SELECT
        id,
        first_name,
        last_name,
        max_guests as party_size,
        arrival_time,
        seated_time,
        left_time,
        status,
        booked_by,
        is_vip,
        tags,
        min_price,
        reservation_type,
        venue_seating_area_name,
        notes,
        client_requests,
        array_to_string(table_numbers, ', ') as table_number
      FROM public.full_reservations
      WHERE location_uuid = ANY($1::uuid[]) AND date = $2
        AND status IN ('COMPLETE', 'ARRIVED', 'SEATED', 'CONFIRMED', 'PENDING', 'PAID', 'CANCELLED')
      ORDER BY arrival_time ASC NULLS LAST, is_vip DESC`,
    [locationUuids, date]
  );

  const reservations = result.rows.map(row => {
    const r = cleanRow(row);
    return {
      id: r.id,
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      party_size: r.party_size || 0,
      arrival_time: r.arrival_time || null,
      seated_time: r.seated_time || null,
      left_time: r.left_time || null,
      status: r.status || 'PENDING',
      booked_by: r.booked_by || null,
      is_vip: !!r.is_vip,
      tags: r.tags || null,
      min_price: r.min_price || null,
      reservation_type: r.reservation_type || null,
      venue_seating_area_name: r.venue_seating_area_name || null,
      notes: r.notes || null,
      client_requests: r.client_requests || null,
      table_number: r.table_number || null,
    } as ReservationSummary;
  });

  return { reservations, total: reservations.length };
}
