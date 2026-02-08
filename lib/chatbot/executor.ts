/**
 * Secure tool executor for the OpsOS chatbot.
 * Maps tool calls to query functions, injects locationUuids server-side,
 * and validates date ranges.
 */

import type { Pool } from 'pg';
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
 * Execute a chatbot tool call securely.
 * locationUuids are injected server-side — the AI never controls which locations are queried.
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>,
  locationUuids: string[],
  pool: Pool
): Promise<string> {
  try {
    const dates = parseDates(toolInput);

    switch (toolName) {
      case 'get_daily_sales':
        return formatResults(
          await getDailySales(pool, locationUuids, dates),
          toolName
        );

      case 'get_sales_by_category':
        return formatResults(
          await getSalesByCategory(pool, locationUuids, dates),
          toolName
        );

      case 'get_server_performance':
        return formatResults(
          await getServerPerformance(pool, locationUuids, dates),
          toolName
        );

      case 'get_top_menu_items':
        return formatResults(
          await getTopMenuItems(pool, locationUuids, {
            ...dates,
            sortBy: toolInput.sort_by === 'quantity' ? 'quantity' : 'revenue',
          }),
          toolName
        );

      case 'get_comp_summary':
        return formatResults(
          await getCompSummary(pool, locationUuids, dates),
          toolName
        );

      case 'get_labor_summary':
        return formatResults(
          await getLaborSummary(pool, locationUuids, dates),
          toolName
        );

      case 'get_reservations':
        return formatResults(
          await getReservations(pool, locationUuids, dates),
          toolName
        );

      case 'get_payment_details':
        return formatResults(
          await getPaymentDetails(pool, locationUuids, dates),
          toolName
        );

      case 'get_logbook':
        return formatResults(
          await getLogbook(pool, locationUuids, dates),
          toolName
        );

      default:
        return `Unknown tool: ${toolName}. Available tools: get_daily_sales, get_sales_by_category, get_server_performance, get_top_menu_items, get_comp_summary, get_labor_summary, get_reservations, get_payment_details, get_logbook.`;
    }
  } catch (error) {
    if (typeof error === 'string') {
      return `Error: ${error}`;
    }
    console.error(`[chatbot] Tool ${toolName} error:`, error);
    return `Error executing ${toolName}. Please try a different query.`;
  }
}
