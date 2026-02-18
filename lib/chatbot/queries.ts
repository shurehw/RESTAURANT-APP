/**
 * Pre-built parameterized queries for the OpsOS chatbot.
 * Every query requires locationUuids (injected server-side) and date params.
 *
 * Supports three data sources:
 *   - tipsee_checks / tipsee_check_items  (Upserve, May 2025+)
 *   - tipsee_simphony_sales               (Simphony / Dallas)
 *   - checks / check_items                (Legacy, pre-May 2025)
 */

import type { Pool } from 'pg';
import { cleanRow } from '@/lib/database/tipsee';

const MAX_ROWS = 200;

// ---------------------------------------------------------------------------
// Location context: split UUIDs by POS type + resolve legacy names
// ---------------------------------------------------------------------------

export interface LocationContext {
  upserveUuids: string[];
  simphonyUuids: string[];
  /** UUID → legacy location name for the `checks` table */
  legacyNames: string[];
}

/** Known venue name overrides where legacy `checks.location` differs from `general_locations.location_name` */
const LEGACY_NAME_OVERRIDES: Record<string, string> = {
  'Nice Guy LA': 'The Nice Guy',
};

let _cachedContext: LocationContext | null = null;
let _cachedFor: string | null = null;

export async function resolveLocationContext(
  pool: Pool,
  locationUuids: string[]
): Promise<LocationContext> {
  const key = locationUuids.sort().join(',');
  if (_cachedContext && _cachedFor === key) return _cachedContext;

  const result = await pool.query(
    `SELECT uuid::text, location_name, COALESCE(pos_type, 'upserve') as pos_type
     FROM public.general_locations
     WHERE uuid = ANY($1::uuid[])`,
    [locationUuids]
  );

  const upserveUuids: string[] = [];
  const simphonyUuids: string[] = [];
  const legacyNames: string[] = [];

  for (const row of result.rows) {
    if (row.pos_type === 'simphony') {
      simphonyUuids.push(row.uuid);
    } else {
      upserveUuids.push(row.uuid);
    }
    // Build legacy name list for all locations
    const name = row.location_name as string;
    if (name) {
      legacyNames.push(LEGACY_NAME_OVERRIDES[name] || name);
    }
  }

  // Also include UUIDs that weren't found in general_locations (assume Upserve)
  for (const uuid of locationUuids) {
    if (!upserveUuids.includes(uuid) && !simphonyUuids.includes(uuid)) {
      upserveUuids.push(uuid);
    }
  }

  _cachedContext = { upserveUuids, simphonyUuids, legacyNames };
  _cachedFor = key;
  return _cachedContext;
}

/** Reset cached context (call between requests if needed) */
export function resetLocationContext() {
  _cachedContext = null;
  _cachedFor = null;
}

// ---------------------------------------------------------------------------
// 1. Daily Sales Summary
// ---------------------------------------------------------------------------
export async function getDailySales(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string; dayOfWeek?: number },
  ctx?: LocationContext
): Promise<Record<string, any>[]> {
  const loc = ctx || await resolveLocationContext(pool, locationUuids);
  const allRows: Record<string, any>[] = [];

  // Optional day-of-week filter (PostgreSQL DOW: 0=Sun, 1=Mon, ... 6=Sat)
  const dowClause = params.dayOfWeek != null
    ? `AND EXTRACT(DOW FROM trading_day) = ${params.dayOfWeek}`
    : '';

  // Upserve: tipsee_checks
  if (loc.upserveUuids.length > 0) {
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
      WHERE location_uuid = ANY($1::uuid[])
        AND trading_day >= $2 AND trading_day <= $3
        ${dowClause}
      GROUP BY trading_day
      ORDER BY trading_day DESC
      LIMIT $4`,
      [loc.upserveUuids, params.startDate, params.endDate, MAX_ROWS]
    );

    if (result.rows.length > 0) {
      allRows.push(...result.rows.map(cleanRow));
    } else if (loc.legacyNames.length > 0) {
      // Legacy fallback: checks table (pre-May 2025)
      const legacy = await pool.query(
        `SELECT
          trading_day,
          COUNT(*) as total_checks,
          SUM(guest_count) as total_covers,
          SUM(revenue_total) as net_sales,
          SUM(sub_total) as sub_total,
          SUM(tax_total) as total_tax,
          SUM(comp_total) as total_comps,
          SUM(void_total) as total_voids
        FROM public.checks
        WHERE location = ANY($1::text[])
          AND trading_day >= $2 AND trading_day <= $3
          ${dowClause}
        GROUP BY trading_day
        ORDER BY trading_day DESC
        LIMIT $4`,
        [loc.legacyNames, params.startDate, params.endDate, MAX_ROWS]
      );
      allRows.push(...legacy.rows.map(cleanRow));
    }
  }

  // Simphony: tipsee_simphony_sales (aggregated by revenue center)
  if (loc.simphonyUuids.length > 0) {
    const simphony = await pool.query(
      `SELECT
        trading_day,
        SUM(check_count) as total_checks,
        SUM(guest_count) as total_covers,
        SUM(net_sales) as net_sales,
        SUM(gross_sales) as sub_total,
        SUM(tax_total) as total_tax,
        ABS(SUM(discount_total)) as total_comps,
        ABS(SUM(void_total)) as total_voids
      FROM public.tipsee_simphony_sales
      WHERE location_uuid = ANY($1::uuid[])
        AND trading_day >= $2 AND trading_day <= $3
        ${dowClause}
      GROUP BY trading_day
      ORDER BY trading_day DESC
      LIMIT $4`,
      [loc.simphonyUuids, params.startDate, params.endDate, MAX_ROWS]
    );
    allRows.push(...simphony.rows.map(cleanRow));
  }

  // Merge rows by trading_day (in case both sources have data for same date)
  const merged = mergeDailyRows(allRows);
  return merged.sort((a, b) => (b.trading_day > a.trading_day ? 1 : -1)).slice(0, MAX_ROWS);
}

function mergeDailyRows(rows: Record<string, any>[]): Record<string, any>[] {
  const map = new Map<string, Record<string, any>>();
  for (const row of rows) {
    const key = String(row.trading_day);
    const existing = map.get(key);
    if (existing) {
      existing.total_checks += row.total_checks || 0;
      existing.total_covers += row.total_covers || 0;
      existing.net_sales += row.net_sales || 0;
      existing.sub_total += row.sub_total || 0;
      existing.total_tax += row.total_tax || 0;
      existing.total_comps += row.total_comps || 0;
      existing.total_voids += row.total_voids || 0;
    } else {
      map.set(key, { ...row });
    }
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// 2. Sales by Category
// ---------------------------------------------------------------------------
export async function getSalesByCategory(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string; dayOfWeek?: number },
  ctx?: LocationContext
): Promise<Record<string, any>[]> {
  const loc = ctx || await resolveLocationContext(pool, locationUuids);
  const allRows: Record<string, any>[] = [];
  const dowClause = params.dayOfWeek != null
    ? `AND EXTRACT(DOW FROM trading_day) = ${params.dayOfWeek}`
    : '';

  // Upserve: tipsee_check_items
  if (loc.upserveUuids.length > 0) {
    const result = await pool.query(
      `SELECT
        COALESCE(parent_category, 'Other') as category,
        SUM(price * quantity) as gross_sales,
        SUM(comp_total) as comps,
        SUM(void_value) as voids,
        SUM(price * quantity) - SUM(COALESCE(comp_total, 0)) - SUM(COALESCE(void_value, 0)) as net_sales
      FROM public.tipsee_check_items
      WHERE location_uuid = ANY($1::uuid[])
        AND trading_day >= $2 AND trading_day <= $3
        ${dowClause}
      GROUP BY parent_category
      ORDER BY net_sales DESC
      LIMIT $4`,
      [loc.upserveUuids, params.startDate, params.endDate, MAX_ROWS]
    );

    if (result.rows.length > 0) {
      allRows.push(...result.rows.map(cleanRow));
    } else if (loc.legacyNames.length > 0) {
      // Legacy fallback
      const legacy = await pool.query(
        `SELECT
          COALESCE(ci.parent_category, 'Other') as category,
          SUM(ci.price * ci.quantity) as gross_sales,
          SUM(ci.comp_total) as comps,
          SUM(ci.void_value) as voids,
          SUM(ci.price * ci.quantity) - SUM(COALESCE(ci.comp_total, 0)) - SUM(COALESCE(ci.void_value, 0)) as net_sales
        FROM public.check_items ci
        JOIN public.checks c ON ci.check_id = c.id
        WHERE c.location = ANY($1::text[])
          AND c.trading_day >= $2 AND c.trading_day <= $3
          ${dowClause}
        GROUP BY ci.parent_category
        ORDER BY net_sales DESC
        LIMIT $4`,
        [loc.legacyNames, params.startDate, params.endDate, MAX_ROWS]
      );
      allRows.push(...legacy.rows.map(cleanRow));
    }
  }

  // Simphony: food/bev split from revenue centers
  if (loc.simphonyUuids.length > 0) {
    const simphony = await pool.query(
      `SELECT
        CASE
          WHEN LOWER(COALESCE(revenue_center_name, '')) LIKE '%bar%'
            OR (revenue_center_name IS NULL AND revenue_center_number = 2)
          THEN 'Beverage'
          ELSE 'Food'
        END as category,
        SUM(gross_sales) as gross_sales,
        ABS(SUM(discount_total)) as comps,
        ABS(SUM(void_total)) as voids,
        SUM(net_sales) as net_sales
      FROM public.tipsee_simphony_sales
      WHERE location_uuid = ANY($1::uuid[])
        AND trading_day >= $2 AND trading_day <= $3
        ${dowClause}
      GROUP BY category
      ORDER BY net_sales DESC`,
      [loc.simphonyUuids, params.startDate, params.endDate]
    );
    allRows.push(...simphony.rows.map(cleanRow));
  }

  return allRows;
}

// ---------------------------------------------------------------------------
// 3. Server Performance
// ---------------------------------------------------------------------------
export async function getServerPerformance(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string; dayOfWeek?: number },
  ctx?: LocationContext
): Promise<Record<string, any>[]> {
  const loc = ctx || await resolveLocationContext(pool, locationUuids);
  const dowClause = params.dayOfWeek != null
    ? `AND EXTRACT(DOW FROM c.trading_day) = ${params.dayOfWeek}`
    : '';

  // Upserve: tipsee_checks (per-check data with server names)
  if (loc.upserveUuids.length > 0) {
    const result = await pool.query(
      `SELECT
        c.employee_name,
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
      WHERE c.location_uuid = ANY($1::uuid[])
        AND c.trading_day >= $2 AND c.trading_day <= $3
        ${dowClause}
      GROUP BY c.employee_name
      ORDER BY net_sales DESC
      LIMIT $4`,
      [loc.upserveUuids, params.startDate, params.endDate, MAX_ROWS]
    );

    if (result.rows.length > 0) return result.rows.map(cleanRow);

    // Legacy fallback (checks + payments tables)
    if (loc.legacyNames.length > 0) {
      const legacy = await pool.query(
        `SELECT
          c.employee_name,
          SUM(c.revenue_total) as net_sales,
          COUNT(*) as check_count,
          SUM(c.guest_count) as guest_count,
          ROUND((SUM(c.revenue_total) / NULLIF(SUM(c.guest_count), 0))::numeric, 2) as avg_spend_per_guest,
          COUNT(DISTINCT c.table_name || '-' || c.trading_day) as table_turns,
          ROUND((SUM(c.revenue_total) / NULLIF(COUNT(*), 0))::numeric, 2) as avg_check,
          ROUND((SUM(COALESCE(pt.total_tips, 0)) / NULLIF(SUM(c.revenue_total), 0) * 100)::numeric, 1) as tip_pct,
          SUM(COALESCE(pt.total_tips, 0)) as total_tips
        FROM public.checks c
        LEFT JOIN LATERAL (
          SELECT SUM(tip_amount) as total_tips
          FROM public.payments WHERE check_id = c.id AND tip_amount > 0
        ) pt ON true
        WHERE c.location = ANY($1::text[])
          AND c.trading_day >= $2 AND c.trading_day <= $3
          ${dowClause}
        GROUP BY c.employee_name
        ORDER BY net_sales DESC
        LIMIT $4`,
        [loc.legacyNames, params.startDate, params.endDate, MAX_ROWS]
      );
      if (legacy.rows.length > 0) return legacy.rows.map(cleanRow);
    }
  }

  // Simphony: no per-check/server data available
  return [];
}

// ---------------------------------------------------------------------------
// 4. Top Menu Items
// ---------------------------------------------------------------------------
export async function getTopMenuItems(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string; sortBy?: 'revenue' | 'quantity' },
  ctx?: LocationContext
): Promise<Record<string, any>[]> {
  const loc = ctx || await resolveLocationContext(pool, locationUuids);
  const orderCol = params.sortBy === 'quantity' ? 'qty' : 'net_total';

  // Upserve: tipsee_check_items
  if (loc.upserveUuids.length > 0) {
    const result = await pool.query(
      `SELECT
        ci.name,
        COALESCE(ci.parent_category, 'Other') as category,
        SUM(ci.quantity) as qty,
        SUM(ci.price * ci.quantity) as net_total
      FROM public.tipsee_check_items ci
      WHERE ci.location_uuid = ANY($1::uuid[])
        AND ci.trading_day >= $2 AND ci.trading_day <= $3
      GROUP BY ci.name, ci.parent_category
      ORDER BY ${orderCol} DESC
      LIMIT $4`,
      [loc.upserveUuids, params.startDate, params.endDate, MAX_ROWS]
    );

    if (result.rows.length > 0) return result.rows.map(cleanRow);

    // Legacy fallback
    if (loc.legacyNames.length > 0) {
      const legacy = await pool.query(
        `SELECT
          ci.name,
          COALESCE(ci.parent_category, 'Other') as category,
          SUM(ci.quantity) as qty,
          SUM(ci.price * ci.quantity) as net_total
        FROM public.check_items ci
        JOIN public.checks c ON ci.check_id = c.id
        WHERE c.location = ANY($1::text[])
          AND c.trading_day >= $2 AND c.trading_day <= $3
        GROUP BY ci.name, ci.parent_category
        ORDER BY ${orderCol} DESC
        LIMIT $4`,
        [loc.legacyNames, params.startDate, params.endDate, MAX_ROWS]
      );
      if (legacy.rows.length > 0) return legacy.rows.map(cleanRow);
    }
  }

  // Simphony: no item-level data
  return [];
}

// ---------------------------------------------------------------------------
// 5. Comp Summary
// ---------------------------------------------------------------------------
export async function getCompSummary(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string },
  ctx?: LocationContext
): Promise<Record<string, any>[]> {
  const loc = ctx || await resolveLocationContext(pool, locationUuids);

  // Upserve: tipsee_checks
  if (loc.upserveUuids.length > 0) {
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
        WHERE location_uuid = ANY($1::uuid[])
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
      [loc.upserveUuids, params.startDate, params.endDate, MAX_ROWS]
    );

    if (result.rows.length > 0) return result.rows.map(cleanRow);

    // Legacy fallback
    if (loc.legacyNames.length > 0) {
      const legacy = await pool.query(
        `WITH check_comps AS (
          SELECT
            COALESCE(NULLIF(voidcomp_reason_text, ''), 'Unknown') as reason,
            id as check_id,
            comp_total as amount,
            employee_name as server,
            table_name,
            trading_day
          FROM public.checks
          WHERE location = ANY($1::text[])
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
        [loc.legacyNames, params.startDate, params.endDate, MAX_ROWS]
      );
      if (legacy.rows.length > 0) return legacy.rows.map(cleanRow);
    }
  }

  // Simphony: only aggregate discount_total, no reason breakdown
  if (loc.simphonyUuids.length > 0) {
    const simphony = await pool.query(
      `SELECT
        'Discount' as reason,
        SUM(check_count) as qty,
        ABS(SUM(discount_total)) as total_amount,
        MIN(trading_day) as first_date,
        MAX(trading_day) as last_date
      FROM public.tipsee_simphony_sales
      WHERE location_uuid = ANY($1::uuid[])
        AND trading_day >= $2 AND trading_day <= $3
        AND discount_total != 0
      HAVING ABS(SUM(discount_total)) > 0`,
      [loc.simphonyUuids, params.startDate, params.endDate]
    );
    if (simphony.rows.length > 0) return simphony.rows.map(cleanRow);
  }

  return [];
}

// ---------------------------------------------------------------------------
// 6. Labor Summary (unchanged — uses 7shifts punches, not POS-specific)
// ---------------------------------------------------------------------------
export async function getLaborSummary(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string; dayOfWeek?: number }
): Promise<Record<string, any>[]> {
  const dowClause = params.dayOfWeek != null
    ? `AND EXTRACT(DOW FROM clocked_in::date) = ${params.dayOfWeek}`
    : '';

  // Primary: tipsee_7shifts_punches (most complete data source)
  const result = await pool.query(
    `SELECT
      clocked_in::date as work_date,
      COUNT(*) as punch_count,
      COUNT(DISTINCT user_id) as employee_count,
      ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600), 0)::numeric, 1) as total_hours,
      ROUND(COALESCE(SUM(
        EXTRACT(EPOCH FROM (clocked_out - clocked_in)) / 3600 *
        CASE WHEN COALESCE(hourly_wage, 0) > 100 THEN COALESCE(hourly_wage, 0) / 100.0 ELSE COALESCE(hourly_wage, 0) END
      ), 0)::numeric, 2) as labor_cost
    FROM public.tipsee_7shifts_punches
    WHERE location_uuid = ANY($1::uuid[])
      AND clocked_in::date >= $2::date AND clocked_in::date <= $3::date
      ${dowClause}
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
  const dowClauseFb = params.dayOfWeek != null
    ? `AND EXTRACT(DOW FROM p.clocked_in::date) = ${params.dayOfWeek}`
    : '';

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
    WHERE p.location_uuid = ANY($1::uuid[])
      AND p.clocked_in::date >= $2::date AND p.clocked_in::date <= $3::date
      ${dowClauseFb}
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
// 7. Reservations (unchanged — same table regardless of POS)
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
    WHERE location_uuid = ANY($1::uuid[])
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
  params: { startDate: string; endDate: string },
  ctx?: LocationContext
): Promise<Record<string, any>[]> {
  const loc = ctx || await resolveLocationContext(pool, locationUuids);

  // Upserve: tipsee_checks + tipsee_payments
  if (loc.upserveUuids.length > 0) {
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
      WHERE c.location_uuid = ANY($1::uuid[])
        AND c.trading_day >= $2 AND c.trading_day <= $3
        AND c.revenue_total > 0
      ORDER BY c.revenue_total DESC
      LIMIT $4`,
      [loc.upserveUuids, params.startDate, params.endDate, MAX_ROWS]
    );

    if (result.rows.length > 0) return result.rows.map(cleanRow);

    // Legacy fallback
    if (loc.legacyNames.length > 0) {
      const legacy = await pool.query(
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
        FROM public.checks c
        LEFT JOIN LATERAL (
          SELECT cc_name, tip_amount, amount
          FROM public.payments
          WHERE check_id = c.id
          ORDER BY (cc_name IS NOT NULL AND cc_name != '') DESC, tip_amount DESC NULLS LAST, amount DESC
          LIMIT 1
        ) p ON true
        WHERE c.location = ANY($1::text[])
          AND c.trading_day >= $2 AND c.trading_day <= $3
          AND c.revenue_total > 0
        ORDER BY c.revenue_total DESC
        LIMIT $4`,
        [loc.legacyNames, params.startDate, params.endDate, MAX_ROWS]
      );
      if (legacy.rows.length > 0) return legacy.rows.map(cleanRow);
    }
  }

  // Simphony: no per-check payment data
  return [];
}

// ---------------------------------------------------------------------------
// 9. Logbook (unchanged — same table regardless of POS)
// ---------------------------------------------------------------------------
export async function getLogbook(
  pool: Pool,
  locationUuids: string[],
  params: { startDate: string; endDate: string }
): Promise<Record<string, any>[]> {
  const result = await pool.query(
    `SELECT *
    FROM public.tipsee_daily_logbook
    WHERE location_uuid = ANY($1::uuid[])
      AND logbook_date >= $2 AND logbook_date <= $3
    ORDER BY logbook_date DESC
    LIMIT $4`,
    [locationUuids, params.startDate, params.endDate, MAX_ROWS]
  );
  return result.rows.map(cleanRow);
}
