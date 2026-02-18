/**
 * Secure tool executor for the OpsOS chatbot.
 * Maps tool calls to query functions, injects locationUuids server-side,
 * and validates date ranges.
 */

import type { Pool } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getDailySales,
  getSalesByCategory,
  getServerPerformance,
  getTopMenuItems,
  getCompSummary,
  getLaborSummary,
  getReservations,
  getPaymentDetails,
  getLogbook,
  resolveLocationContext,
  type LocationContext,
} from './queries';
import {
  getBudgetVariance,
  getOperationalExceptions,
  getDemandForecasts,
  getInvoices,
  getCurrentInventory,
  getLiveSalesPace,
  getPeriodComparison,
} from './supabase-queries';
import {
  fetchCheckDetail,
} from '@/lib/database/tipsee';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';

type VenueMapEntry = { venueId: string; locationUuid: string };

const MAX_DATE_RANGE_DAYS = 1095; // ~3 years — data goes back to legacy tables
const MAX_DISPLAY_ROWS = 100;

const DOW_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function parseDayOfWeek(input: string | undefined): number | undefined {
  if (!input || typeof input !== 'string') return undefined;
  return DOW_MAP[input.toLowerCase()];
}

/**
 * Validate and normalize date params from the AI tool call.
 * Returns { startDate, endDate } or throws descriptive error string.
 */
function parseDates(input: Record<string, any>): { startDate: string; endDate: string } {
  const startDate = input.start_date;
  if (!startDate || typeof startDate !== 'string') {
    throw 'start_date is required (YYYY-MM-DD format)';
  }

  // Basic format validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw `Invalid start_date format: "${startDate}". Use YYYY-MM-DD.`;
  }

  const endDate = input.end_date && typeof input.end_date === 'string'
    ? input.end_date
    : startDate;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw `Invalid end_date format: "${endDate}". Use YYYY-MM-DD.`;
  }

  // Check range
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 0) {
    throw `end_date (${endDate}) cannot be before start_date (${startDate})`;
  }
  if (diffDays > MAX_DATE_RANGE_DAYS) {
    throw `Date range exceeds ${MAX_DATE_RANGE_DAYS} days. Please narrow your query.`;
  }

  return { startDate, endDate };
}

/**
 * Format query results into a string for the AI.
 * Truncates if too many rows.
 */
function formatResults(rows: Record<string, any>[], toolName: string): string {
  if (rows.length === 0) {
    return `No data found for ${toolName} in the requested date range.`;
  }

  const displayRows = rows.slice(0, MAX_DISPLAY_ROWS);
  const result = JSON.stringify(displayRows, null, 2);

  if (rows.length > MAX_DISPLAY_ROWS) {
    return `${result}\n\n[Showing ${MAX_DISPLAY_ROWS} of ${rows.length} results. Ask the user to narrow their date range for complete data.]`;
  }

  return result;
}

/**
 * Resolve venue filter: if the AI passed a "venue" param, narrow
 * locationUuids/venueIds to just that venue using fuzzy matching.
 */
function resolveVenueFilter(
  venueInput: string | undefined,
  allLocationUuids: string[],
  allVenueIds: string[],
  venueMap: Record<string, VenueMapEntry>
): { locationUuids: string[]; venueIds: string[] } {
  if (!venueInput || typeof venueInput !== 'string') {
    return { locationUuids: allLocationUuids, venueIds: allVenueIds };
  }

  const search = venueInput.toLowerCase().trim();

  // Try exact match first, then partial match
  let match = venueMap[search];
  if (!match) {
    const key = Object.keys(venueMap).find(k => k.includes(search) || search.includes(k));
    if (key) match = venueMap[key];
  }

  if (match) {
    return {
      locationUuids: [match.locationUuid],
      venueIds: [match.venueId],
    };
  }

  // No match — return all (AI will get all-venue data)
  return { locationUuids: allLocationUuids, venueIds: allVenueIds };
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  ctx: {
    locationUuids: string[];
    venueIds: string[];
    venueMap: Record<string, VenueMapEntry>;
    pool: Pool;
    supabase: SupabaseClient;
  }
): Promise<string> {
  try {
    // Resolve venue filter for this tool call
    const filtered = resolveVenueFilter(
      toolInput.venue,
      ctx.locationUuids,
      ctx.venueIds,
      ctx.venueMap
    );

    // Supabase tools (no dates required for some)
    switch (toolName) {
      case 'get_operational_exceptions':
        return formatResults(
          await getOperationalExceptions(ctx.supabase, filtered.venueIds),
          toolName
        );

      case 'get_current_inventory':
        return formatResults(
          await getCurrentInventory(ctx.supabase, filtered.venueIds, {
            category: toolInput.category,
            search: toolInput.search,
          }),
          toolName
        );

      case 'get_live_sales_pace': {
        if (filtered.venueIds.length === 0) {
          return 'Error: Could not resolve venue. Please specify which venue to check pace for.';
        }
        // Use first matched venue for live pace
        return formatResults(
          await getLiveSalesPace(filtered.venueIds[0]),
          toolName
        );
      }

      case 'get_check_detail': {
        const checkId = toolInput.check_id;
        if (!checkId) return 'Error: check_id is required.';
        const detail = await fetchCheckDetail(checkId);
        if (!detail) return `No check found with ID "${checkId}".`;
        return JSON.stringify(detail, null, 2);
      }

      case 'search_checks': {
        if (filtered.venueIds.length === 0) {
          return 'Error: Could not resolve venue for check search.';
        }

        // Resolve dates: single date or date range
        const searchDate = toolInput.date;
        const searchStart = toolInput.start_date || searchDate;
        const searchEnd = toolInput.end_date || searchStart;
        if (!searchStart) return 'Error: date or start_date is required for check search.';

        // Get TipSee location UUIDs for the venue
        const locationUuids = await getTipseeMappingForVenue(filtered.venueIds[0]);
        if (locationUuids.length === 0) {
          return 'No TipSee mapping found for this venue. Check data is not available.';
        }

        // Build dynamic WHERE clauses
        const conditions: string[] = [
          'c.location_uuid = ANY($1::uuid[])',
          'c.trading_day >= $2',
          'c.trading_day <= $3',
        ];
        const params: any[] = [locationUuids, searchStart, searchEnd];
        let paramIdx = 4;

        if (toolInput.server_name) {
          conditions.push(`c.employee_name ILIKE $${paramIdx}`);
          params.push(`%${toolInput.server_name}%`);
          paramIdx++;
        }
        if (toolInput.table_name) {
          conditions.push(`c.table_name ILIKE $${paramIdx}`);
          params.push(`%${toolInput.table_name}%`);
          paramIdx++;
        }
        if (toolInput.min_amount != null) {
          conditions.push(`c.revenue_total >= $${paramIdx}`);
          params.push(toolInput.min_amount);
          paramIdx++;
        }
        if (toolInput.max_amount != null) {
          conditions.push(`c.revenue_total <= $${paramIdx}`);
          params.push(toolInput.max_amount);
          paramIdx++;
        }
        if (toolInput.cardholder_name) {
          conditions.push(`pay.cc_names ILIKE $${paramIdx}`);
          params.push(`%${toolInput.cardholder_name}%`);
          paramIdx++;
        }

        const sql = `SELECT
          c.id, c.trading_day, c.table_name, c.employee_name, c.guest_count,
          c.sub_total, c.revenue_total, c.comp_total, c.void_total,
          c.open_time, c.close_time,
          (c.close_time IS NULL) as is_open,
          COALESCE(pay.payment_total, 0) as payment_total,
          COALESCE(pay.tip_total, 0) as tip_total,
          pay.cc_names as cardholder_names
        FROM public.tipsee_checks c
        LEFT JOIN LATERAL (
          SELECT
            SUM(amount) as payment_total,
            SUM(COALESCE(tip_amount, 0)) as tip_total,
            STRING_AGG(DISTINCT cc_name, ', ') FILTER (WHERE cc_name IS NOT NULL AND cc_name != '') as cc_names
          FROM public.tipsee_payments WHERE check_id = c.id
        ) pay ON true
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.trading_day DESC, c.open_time DESC
        LIMIT ${MAX_DISPLAY_ROWS}`;

        const result = await ctx.pool.query(sql, params);
        return formatResults(result.rows.map((r: any) => ({
          ...r,
          revenue_total: parseFloat(r.revenue_total) || 0,
          comp_total: parseFloat(r.comp_total) || 0,
          tip_total: parseFloat(r.tip_total) || 0,
          payment_total: parseFloat(r.payment_total) || 0,
        })), toolName);
      }

      case 'get_period_comparison': {
        const view = toolInput.view;
        if (!view || !['wtd', 'ptd', 'ytd'].includes(view)) {
          return 'Error: view must be wtd, ptd, or ytd.';
        }
        return formatResults(
          await getPeriodComparison(filtered.venueIds, {
            view,
            date: toolInput.date,
          }),
          toolName
        );
      }
    }

    // All remaining tools require dates
    const dates = parseDates(toolInput);

    // Resolve location context once (cached) for POS-aware queries
    const locCtx: LocationContext = await resolveLocationContext(ctx.pool, filtered.locationUuids);

    switch (toolName) {
      // --- TipSee POS tools ---
      case 'get_daily_sales': {
        const dayOfWeek = parseDayOfWeek(toolInput.day_of_week);
        return formatResults(
          await getDailySales(ctx.pool, filtered.locationUuids, { ...dates, dayOfWeek }, locCtx),
          toolName
        );
      }

      case 'get_sales_by_category': {
        const dayOfWeek = parseDayOfWeek(toolInput.day_of_week);
        return formatResults(
          await getSalesByCategory(ctx.pool, filtered.locationUuids, { ...dates, dayOfWeek }, locCtx),
          toolName
        );
      }

      case 'get_server_performance': {
        const dayOfWeek = parseDayOfWeek(toolInput.day_of_week);
        return formatResults(
          await getServerPerformance(ctx.pool, filtered.locationUuids, { ...dates, dayOfWeek }, locCtx),
          toolName
        );
      }

      case 'get_top_menu_items':
        return formatResults(
          await getTopMenuItems(ctx.pool, filtered.locationUuids, {
            ...dates,
            sortBy: toolInput.sort_by === 'quantity' ? 'quantity' : 'revenue',
          }, locCtx),
          toolName
        );

      case 'get_comp_summary':
        return formatResults(
          await getCompSummary(ctx.pool, filtered.locationUuids, dates, locCtx),
          toolName
        );

      case 'get_labor_summary': {
        const dayOfWeek = parseDayOfWeek(toolInput.day_of_week);
        const laborRows = await getLaborSummary(ctx.pool, filtered.locationUuids, { ...dates, dayOfWeek });
        if (laborRows.length > 0) {
          return formatResults(laborRows, toolName);
        }
        // Fallback: labor_day_facts from Supabase (uses venue_id, always populated by ETL)
        const dowFilter = dayOfWeek != null
          ? (r: any) => new Date(r.business_date).getUTCDay() === dayOfWeek
          : () => true;
        const { data: ldf } = await (ctx.supabase as any)
          .from('labor_day_facts')
          .select('business_date, total_hours, labor_cost, punch_count, employee_count, labor_pct, splh')
          .in('venue_id', filtered.venueIds)
          .gte('business_date', dates.startDate)
          .lte('business_date', dates.endDate)
          .order('business_date', { ascending: false })
          .limit(MAX_DISPLAY_ROWS);
        const ldfRows = (ldf || []).filter(dowFilter).map((r: any) => ({
          work_date: r.business_date,
          punch_count: r.punch_count,
          employee_count: r.employee_count,
          total_hours: parseFloat(r.total_hours) || 0,
          labor_cost: parseFloat(r.labor_cost) || 0,
          labor_pct: r.labor_pct ? `${r.labor_pct}%` : null,
          splh: r.splh ? parseFloat(r.splh) : null,
        }));
        return formatResults(ldfRows, toolName);
      }

      case 'get_reservations':
        return formatResults(
          await getReservations(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_payment_details':
        return formatResults(
          await getPaymentDetails(ctx.pool, filtered.locationUuids, dates, locCtx),
          toolName
        );

      case 'get_logbook':
        return formatResults(
          await getLogbook(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      // --- Supabase internal tools ---
      case 'get_budget_variance':
        return formatResults(
          await getBudgetVariance(ctx.supabase, filtered.venueIds, dates),
          toolName
        );

      case 'get_demand_forecasts':
        return formatResults(
          await getDemandForecasts(ctx.supabase, filtered.venueIds, dates),
          toolName
        );

      case 'get_invoices':
        return formatResults(
          await getInvoices(ctx.supabase, filtered.venueIds, {
            ...dates,
            status: toolInput.status,
          }),
          toolName
        );

      default:
        return `Unknown tool: ${toolName}.`;
    }
  } catch (error) {
    if (typeof error === 'string') {
      return `Error: ${error}`;
    }
    // Extract message from Error objects, Supabase errors ({ message }), or anything else
    const msg = error instanceof Error
      ? error.message
      : (error as any)?.message || String(error);
    console.error(`[chatbot] Tool ${toolName} error:`, msg, error);
    // Surface the actual error to the AI so it can give useful diagnostics
    return `Error executing ${toolName}: ${msg}`;
  }
}
