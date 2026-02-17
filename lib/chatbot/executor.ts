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
  fetchChecksForDate,
} from '@/lib/database/tipsee';
import { getTipseeMappingForVenue } from '@/lib/database/sales-pace';

type VenueMapEntry = { venueId: string; locationUuid: string };

const MAX_DATE_RANGE_DAYS = 90;
const MAX_DISPLAY_ROWS = 30;

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
        const date = toolInput.date;
        if (!date) return 'Error: date is required for check search.';

        // Get TipSee location UUIDs for the venue
        const locationUuids = await getTipseeMappingForVenue(filtered.venueIds[0]);
        if (locationUuids.length === 0) {
          return 'No TipSee mapping found for this venue. Check data is not available.';
        }

        const { checks } = await fetchChecksForDate(locationUuids, date, 50, 0);
        let results = checks;

        // Apply optional server/table filters
        if (toolInput.server_name) {
          const q = toolInput.server_name.toLowerCase();
          results = results.filter((c: any) => c.employee_name.toLowerCase().includes(q));
        }
        if (toolInput.table_name) {
          const q = toolInput.table_name.toLowerCase();
          results = results.filter((c: any) => c.table_name.toLowerCase().includes(q));
        }

        return formatResults(results, toolName);
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

    switch (toolName) {
      // --- TipSee POS tools ---
      case 'get_daily_sales':
        return formatResults(
          await getDailySales(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_sales_by_category':
        return formatResults(
          await getSalesByCategory(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_server_performance':
        return formatResults(
          await getServerPerformance(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_top_menu_items':
        return formatResults(
          await getTopMenuItems(ctx.pool, filtered.locationUuids, {
            ...dates,
            sortBy: toolInput.sort_by === 'quantity' ? 'quantity' : 'revenue',
          }),
          toolName
        );

      case 'get_comp_summary':
        return formatResults(
          await getCompSummary(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_labor_summary':
        return formatResults(
          await getLaborSummary(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_reservations':
        return formatResults(
          await getReservations(ctx.pool, filtered.locationUuids, dates),
          toolName
        );

      case 'get_payment_details':
        return formatResults(
          await getPaymentDetails(ctx.pool, filtered.locationUuids, dates),
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
