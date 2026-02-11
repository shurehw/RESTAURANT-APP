/**
 * TipSee Database Connection
 * Connects to TipSee POS data for nightly reports
 */

import { Pool } from 'pg';

// TipSee database configuration
const TIPSEE_CONFIG = {
  host: process.env.TIPSEE_DB_HOST || 'TIPSEE_HOST_REDACTED',
  user: process.env.TIPSEE_DB_USER || 'TIPSEE_USERNAME_REDACTED',
  port: parseInt(process.env.TIPSEE_DB_PORT || '5432'),
  database: process.env.TIPSEE_DB_NAME || 'postgres',
  password: process.env.TIPSEE_DB_PASSWORD || 'TIPSEE_PASSWORD_REDACTED',
  ssl: { rejectUnauthorized: false },
  max: 15, // Increased from 5 to handle 10 parallel queries + headroom for concurrent users
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000, // Increased from 10s to 20s for slow Azure connections
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

  // Run all 10 independent queries in parallel — allSettled so non-critical
  // failures don't nuke the whole page. Pool max=5 naturally caps concurrency.
  const results = await Promise.allSettled([
    // 0: Daily Summary
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

    // 1: Sales by Category (true net = gross - comps - voids)
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

    // 2: Sales by Subcategory
    pool.query(
      `SELECT
        COALESCE(parent_category, 'Other') as parent_category,
        category,
        SUM(price * quantity) as net_sales
      FROM public.tipsee_check_items
      WHERE location_uuid = $1 AND trading_day = $2
      GROUP BY parent_category, category
      ORDER BY parent_category, net_sales DESC`,
      [locationUuid, date]
    ),

    // 3: Server Performance (with tip data from tipsee_payments)
    pool.query(
      `SELECT
        c.employee_name,
        c.employee_role_name,
        COUNT(*) as tickets,
        SUM(c.guest_count) as covers,
        SUM(c.revenue_total) as net_sales,
        ROUND(AVG(c.revenue_total)::numeric, 2) as avg_ticket,
        ROUND(AVG(CASE WHEN c.close_time > c.open_time THEN EXTRACT(EPOCH FROM (c.close_time - c.open_time))/60 END)::numeric, 0) as avg_turn_mins,
        ROUND((SUM(c.revenue_total) / NULLIF(SUM(c.guest_count), 0))::numeric, 2) as avg_per_cover,
        ROUND((SUM(COALESCE(pt.total_tips, 0)) / NULLIF(SUM(c.revenue_total), 0) * 100)::numeric, 1) as tip_pct,
        SUM(COALESCE(pt.total_tips, 0)) as total_tips
      FROM public.tipsee_checks c
      LEFT JOIN LATERAL (
        SELECT SUM(tip_amount) as total_tips
        FROM public.tipsee_payments WHERE check_id = c.id AND tip_amount > 0
      ) pt ON true
      WHERE c.location_uuid = $1 AND c.trading_day = $2
      GROUP BY c.employee_name, c.employee_role_name
      ORDER BY net_sales DESC`,
      [locationUuid, date]
    ),

    // 4: Menu Items Sold (top 10 food + top 10 beverage)
    pool.query(
      `WITH ranked_items AS (
        SELECT
          ci.name,
          COALESCE(ci.parent_category, 'Other') as parent_category,
          SUM(ci.quantity) as qty,
          SUM(ci.price * ci.quantity) as net_total,
          ROW_NUMBER() OVER (
            PARTITION BY CASE WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
                              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
                              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
                              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
                              OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
                         THEN 'Beverage' ELSE 'Food' END
            ORDER BY SUM(ci.price * ci.quantity) DESC
          ) as rn,
          CASE WHEN LOWER(COALESCE(ci.parent_category, '')) LIKE '%bev%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%wine%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%beer%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%liquor%'
                    OR LOWER(COALESCE(ci.parent_category, '')) LIKE '%cocktail%'
               THEN 'Beverage' ELSE 'Food' END as item_type
        FROM public.tipsee_check_items ci
        WHERE ci.location_uuid = $1 AND ci.trading_day = $2
        GROUP BY ci.name, ci.parent_category
      )
      SELECT name, parent_category, qty, net_total
      FROM ranked_items
      WHERE rn <= 10
      ORDER BY item_type, net_total DESC`,
      [locationUuid, date]
    ),

    // 5: Discounts/Comps Summary - combines check-level and item-level comps
    pool.query(
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
    ),

    // 6: Detailed Comps - finds checks with comps at either check or item level
    pool.query(
      `SELECT DISTINCT
        c.id as check_id,
        c.table_name,
        c.employee_name as server,
        GREATEST(c.comp_total, COALESCE(item_comps.total, 0)) as comp_total,
        c.revenue_total as check_total,
        COALESCE(NULLIF(c.voidcomp_reason_text, ''), 'Unknown') as reason
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

    // 7: Logbook
    pool.query(
      `SELECT * FROM public.tipsee_daily_logbook
       WHERE location_uuid = $1 AND logbook_date = $2
       LIMIT 1`,
      [locationUuid, date]
    ),

    // 8: Notable Guests (Top 5 spenders)
    pool.query(
      `SELECT
        c.id as check_id,
        c.employee_name as server,
        c.guest_count as covers,
        c.revenue_total as payment,
        c.open_time,
        c.close_time,
        c.table_name,
        p.cc_name as cardholder_name,
        p.tip_amount,
        p.amount as payment_amount
      FROM public.tipsee_checks c
      LEFT JOIN LATERAL (
        SELECT cc_name, tip_amount, amount
        FROM public.tipsee_payments
        WHERE check_id = c.id
        ORDER BY (cc_name IS NOT NULL AND cc_name != '') DESC, tip_amount DESC NULLS LAST, amount DESC
        LIMIT 1
      ) p ON true
      WHERE c.location_uuid = $1 AND c.trading_day = $2 AND c.revenue_total > 0
      ORDER BY c.revenue_total DESC
      LIMIT 5`,
      [locationUuid, date]
    ),

    // 9: People We Know (VIP reservations)
    pool.query(
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
    ),
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
          THEN 'Beverage'
          ELSE 'Food'
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

  let food_sales = 0;
  let beverage_sales = 0;
  for (const row of categoryResult.rows) {
    const clean = cleanRow(row);
    if (clean.sales_type === 'Food') food_sales = clean.total;
    else beverage_sales = clean.total;
  }

  return {
    total_checks: summary.total_checks,
    total_covers: summary.total_covers,
    gross_sales: summary.gross_sales,
    net_sales: summary.net_sales,
    food_sales,
    beverage_sales,
    comps_total: summary.comps_total,
    voids_total: summary.voids_total,
  };
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
  const reasonList = approvedReasons
    ? approvedReasons.map(r => r.name.toLowerCase())
    : APPROVED_COMP_REASONS;

  return reasonList.some(approved =>
    normalized.includes(approved) || approved.includes(normalized)
  );
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
    // Primary: tipsee_7shifts_punches (hourly_wage in cents on the row)
    const result = await pool.query(
      `SELECT
        COUNT(*) as punch_count,
        COUNT(DISTINCT user_id) as employee_count,
        COALESCE(SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600), 0) as total_hours,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600 *
          COALESCE(hourly_wage, 0) / 100
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
          COALESCE(SUM(total_hours * hourly_wage / 100), 0) as labor_cost
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
            COALESCE(p.hourly_wage, 0) / 100
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
