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
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
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

// Type for cleaning database rows
function cleanRow(row: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'bigint') {
      clean[k] = Number(v);
    } else if (v instanceof Date) {
      clean[k] = v.toISOString();
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
    net_sales: number;
    comps: number;
    voids: number;
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

export async function fetchNightlyReport(
  date: string,
  locationUuid: string
): Promise<NightlyReportData> {
  const pool = getTipseePool();

  // 1. Daily Summary
  const summaryResult = await pool.query(
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
  );

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

  // 2. Sales by Category
  const salesByCategoryResult = await pool.query(
    `SELECT
      COALESCE(parent_category, 'Other') as category,
      SUM(price * quantity) as net_sales,
      SUM(comp_total) as comps,
      SUM(void_value) as voids
    FROM public.tipsee_check_items
    WHERE location_uuid = $1 AND trading_day = $2
    GROUP BY parent_category
    ORDER BY net_sales DESC`,
    [locationUuid, date]
  );

  // 3. Sales by Subcategory
  const salesBySubcategoryResult = await pool.query(
    `SELECT
      COALESCE(parent_category, 'Other') as parent_category,
      category,
      SUM(price * quantity) as net_sales
    FROM public.tipsee_check_items
    WHERE location_uuid = $1 AND trading_day = $2
    GROUP BY parent_category, category
    ORDER BY parent_category, net_sales DESC`,
    [locationUuid, date]
  );

  // 4. Server Performance
  const serversResult = await pool.query(
    `SELECT
      employee_name,
      employee_role_name,
      COUNT(*) as tickets,
      SUM(guest_count) as covers,
      SUM(revenue_total) as net_sales,
      ROUND(AVG(revenue_total)::numeric, 2) as avg_ticket,
      ROUND(AVG(CASE WHEN close_time > open_time THEN EXTRACT(EPOCH FROM (close_time - open_time))/60 END)::numeric, 0) as avg_turn_mins,
      ROUND((SUM(revenue_total) / NULLIF(SUM(guest_count), 0))::numeric, 2) as avg_per_cover
    FROM public.tipsee_checks
    WHERE location_uuid = $1 AND trading_day = $2
    GROUP BY employee_name, employee_role_name
    ORDER BY net_sales DESC`,
    [locationUuid, date]
  );

  // 5. Menu Items Sold (top 10 food + top 10 beverage)
  const menuItemsResult = await pool.query(
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
  );

  // 6. Discounts/Comps Summary - combines check-level and item-level comps
  const discountsResult = await pool.query(
    `WITH check_comps AS (
      -- Comps recorded at check level
      SELECT
        COALESCE(NULLIF(voidcomp_reason_text, ''), 'Unknown') as reason,
        id as check_id,
        comp_total as amount
      FROM public.tipsee_checks
      WHERE location_uuid = $1 AND trading_day = $2 AND comp_total > 0
    ),
    item_comps AS (
      -- Comps recorded at item level (may not be reflected in check total)
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
      -- Use item-level comps if available, fall back to check-level
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
  );

  // 7. Detailed Comps - finds checks with comps at either check or item level
  const detailedCompsResult = await pool.query(
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
  );

  const detailedComps = [];
  for (const check of detailedCompsResult.rows) {
    const checkData = cleanRow(check);
    const compedItemsResult = await pool.query(
      `SELECT name, quantity, comp_total
       FROM public.tipsee_check_items
       WHERE check_id = $1 AND comp_total > 0
       ORDER BY comp_total DESC`,
      [check.check_id]
    );

    const itemList = compedItemsResult.rows.map((item) => {
      if (item.quantity > 1) {
        return `${item.name} x${Math.floor(item.quantity)} ($${parseFloat(item.comp_total).toFixed(2)})`;
      }
      return `${item.name} ($${parseFloat(item.comp_total).toFixed(2)})`;
    });

    checkData.comped_items = itemList;
    detailedComps.push(checkData);
  }

  // 8. Logbook
  const logbookResult = await pool.query(
    `SELECT * FROM public.tipsee_daily_logbook
     WHERE location_uuid = $1 AND logbook_date = $2
     LIMIT 1`,
    [locationUuid, date]
  );
  const logbook = logbookResult.rows[0] ? cleanRow(logbookResult.rows[0]) : null;

  // 9. Notable Guests (Top 5 spenders)
  const notableGuestsResult = await pool.query(
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
  );

  const notableGuests = [];
  for (const guest of notableGuestsResult.rows) {
    const guestData = cleanRow(guest);

    // Calculate tip percentage
    if (guestData.payment && guestData.tip_amount) {
      const baseAmount = guestData.payment - guestData.tip_amount;
      guestData.tip_percent = baseAmount > 0 ? Math.round((guestData.tip_amount / baseAmount) * 100) : 0;
    } else {
      guestData.tip_percent = null;
    }

    // Get items for this check
    const itemsResult = await pool.query(
      `SELECT name, quantity
       FROM public.tipsee_check_items
       WHERE check_id = $1
       ORDER BY price DESC`,
      [guest.check_id]
    );

    const items = itemsResult.rows.slice(0, 5).map((item) => {
      if (item.quantity > 1) {
        return `${item.name} x${Math.floor(item.quantity)}`;
      }
      return item.name;
    });

    guestData.items = items;
    guestData.additional_items = Math.max(0, itemsResult.rows.length - 5);
    notableGuests.push(guestData);
  }

  // 10. People We Know (VIP reservations)
  const peopleWeKnowResult = await pool.query(
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
  );

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
