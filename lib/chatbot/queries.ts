/**
 * Pre-built parameterized queries for the OpsOS chatbot.
 * Every query requires locationUuids (injected server-side) and date params.
 * SQL patterns extracted from lib/database/tipsee.ts fetchNightlyReport().
 */

import type { Pool } from 'pg';
import { cleanRow } from '@/lib/database/tipsee';

const MAX_ROWS = 50;

// ---------------------------------------------------------------------------
// 1. Daily Sales Summary
// ---------------------------------------------------------------------------
export async function getDailySales(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
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
    WHERE location_uuid = ANY($1::text[])
      AND trading_day >= $2 AND trading_day <= $3
    GROUP BY trading_day
    ORDER BY trading_day DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 2. Sales by Category
// ---------------------------------------------------------------------------
export async function getSalesByCategory(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `SELECT
      COALESCE(parent_category, 'Other') as category,
      SUM(price * quantity) as gross_sales,
      SUM(comp_total) as comps,
      SUM(void_value) as voids,
      SUM(price * quantity) - SUM(COALESCE(comp_total, 0)) - SUM(COALESCE(void_value, 0)) as net_sales
    FROM public.tipsee_check_items
    WHERE location_uuid = ANY($1::text[])
      AND trading_day >= $2 AND trading_day <= $3
    GROUP BY parent_category
    ORDER BY net_sales DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 3. Server Performance
// ---------------------------------------------------------------------------
export async function getServerPerformance(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `SELECT
      c.employee_name,
      c.location as location_name,
      SUM(c.revenue_total) as net_sales,
      COUNT(*) as check_count,
      SUM(c.guest_count) as guest_count,
      ROUND((SUM(c.revenue_total) / NULLIF(SUM(c.guest_count), 0))::numeric, 2) as avg_spend_per_guest,
      COUNT(DISTINCT c.table_name || '-' || c.trading_day) as table_turns,
      ROUND((SUM(c.revenue_total) / NULLIF(COUNT(*), 0))::numeric, 2) as avg_check,
      ROUND((SUM(COALESCE(pt.total_tips, 0)) / NULLIF(SUM(c.revenue_total), 0) * 100)::numeric, 1) as tip_pct,
      SUM(COALESCE(pt.total_tips, 0)) as total_tips
    FROM public.tipsee_checks c
    LEFT JOIN LATERAL (
      SELECT SUM(tip_amount) as total_tips
      FROM public.tipsee_payments WHERE check_id = c.id AND tip_amount > 0
    ) pt ON true
    WHERE c.location_uuid = ANY($1::text[])
      AND c.trading_day >= $2 AND c.trading_day <= $3
    GROUP BY c.employee_name, c.location
    ORDER BY net_sales DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 4. Top Menu Items
// ---------------------------------------------------------------------------
export async function getTopMenuItems(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string; sortBy?: 'revenue' | 'quantity' }
): Promise<Record<string, any>[]> {
  const orderCol = params.sortBy === 'quantity' ? 'qty' : 'net_total';
  const result = await pool.query(
    `SELECT
      ci.name,
      COALESCE(ci.parent_category, 'Other') as category,
      SUM(ci.quantity) as qty,
      SUM(ci.price * ci.quantity) as net_total
    FROM public.tipsee_check_items ci
    WHERE ci.location_uuid = ANY($1::text[])
      AND ci.trading_day >= $2 AND ci.trading_day <= $3
    GROUP BY ci.name, ci.parent_category
    ORDER BY ${orderCol} DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 5. Comp Summary
// ---------------------------------------------------------------------------
export async function getCompSummary(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `WITH check_comps AS (
      SELECT
        COALESCE(NULLIF(voidcomp_reason_text, ''), 'Unknown') as reason,
        id as check_id,
        comp_total as amount,
        employee_name as server,
        table_name,
        trading_day
      FROM public.tipsee_checks
      WHERE location_uuid = ANY($1::text[])
        AND trading_day >= $2 AND trading_day <= $3
        AND comp_total > 0
    )
    SELECT
      reason,
      COUNT(*) as qty,
      SUM(amount) as total_amount,
      MIN(trading_day) as first_date,
      MAX(trading_day) as last_date
    FROM check_comps
    GROUP BY reason
    ORDER BY total_amount DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 6. Labor Summary
// ---------------------------------------------------------------------------
export async function getLaborSummary(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  // Primary: tipsee_7shifts_punches (most complete data source)
  const result = await pool.query(
    `SELECT
      clocked_in::date as work_date,
      COUNT(*) as punch_count,
      COUNT(DISTINCT user_id) as employee_count,
      ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600), 0)::numeric, 1) as total_hours,
      ROUND(COALESCE(SUM(
        EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600 *
        COALESCE(hourly_wage, 0) / 100
      ), 0)::numeric, 2) as labor_cost
    FROM public.tipsee_7shifts_punches
    WHERE location_uuid = ANY($1::text[])
      AND clocked_in::date >= $2::date AND clocked_in::date <= $3::date
      AND clocked_out IS NOT NULL
      AND deleted IS NOT TRUE
    GROUP BY clocked_in::date
    ORDER BY work_date DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );

  if (result.rows.length > 0) {
    return result.rows.map(cleanRow);
  }

  // Fallback: new_tipsee_punches
  const fb = await pool.query(
    `SELECT
      p.clocked_in::date as work_date,
      COUNT(*) as punch_count,
      COUNT(DISTINCT p.user_id) as employee_count,
      ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600), 0)::numeric, 1) as total_hours,
      ROUND(COALESCE(SUM(
        EXTRACT(EPOCH FROM (p.clocked_out - p.clocked_in)) / 3600 *
        COALESCE(w.wage_cents, 0) / 100
      ), 0)::numeric, 2) as labor_cost
    FROM public.new_tipsee_punches p
    LEFT JOIN LATERAL (
      SELECT wage_cents FROM public.new_tipsee_7shifts_users_wages
      WHERE user_id = p.user_id AND effective_date <= p.clocked_in::date
      ORDER BY effective_date DESC LIMIT 1
    ) w ON true
    WHERE p.location_uuid = ANY($1::text[])
      AND p.clocked_in::date >= $2::date AND p.clocked_in::date <= $3::date
      AND p.clocked_out IS NOT NULL
      AND p.is_deleted IS NOT TRUE
    GROUP BY p.clocked_in::date
    ORDER BY work_date DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return fb.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 7. Reservations
// ---------------------------------------------------------------------------
export async function getReservations(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `SELECT
      first_name,
      last_name,
      is_vip,
      tags,
      max_guests as party_size,
      total_payment,
      status,
      date as reservation_date
    FROM public.full_reservations
    WHERE location_uuid = ANY($1::text[])
      AND date >= $2 AND date <= $3
      AND status IN ('COMPLETE', 'ARRIVED', 'SEATED', 'CONFIRMED', 'PENDING')
    ORDER BY is_vip DESC, total_payment DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 8. Payment Details
// ---------------------------------------------------------------------------
export async function getPaymentDetails(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `SELECT
      c.id as check_id,
      c.employee_name as server,
      c.guest_count as covers,
      c.revenue_total as check_total,
      c.table_name,
      c.trading_day,
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
    WHERE c.location_uuid = ANY($1::text[])
      AND c.trading_day >= $2 AND c.trading_day <= $3
      AND c.revenue_total > 0
    ORDER BY c.revenue_total DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}

// ---------------------------------------------------------------------------
// 9. Logbook
// ---------------------------------------------------------------------------
export async function getLogbook(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `SELECT *
    FROM public.tipsee_daily_logbook
    WHERE location_uuid = ANY($1::text[])
      AND logbook_date >= $2 AND logbook_date <= $3
    ORDER BY logbook_date DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}
