/**
 * Anthropic tool definitions for the OpsOS chatbot.
 * Each tool maps 1:1 to a query function in queries.ts.
 */

import type Anthropic from '@anthropic-ai/sdk';

const VENUE_PARAM = {
  type: 'string',
  description:
    'Venue name to filter results (e.g. "Delilah Miami", "Nice Guy LA"). Omit to include all venues.',
} as const;

export const CHATBOT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_daily_sales',
    description:
      'Get daily sales summary including revenue, total checks, covers (guests), comps, voids, and tax for one or more dates. Use this for questions about revenue, sales totals, guest counts, or daily performance. Supports filtering by day of week (e.g. "only Saturdays") for multi-week averages — use day_of_week to avoid fetching unnecessary rows.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description:
            'End date in YYYY-MM-DD format. Defaults to start_date for single-day queries.',
        },
        day_of_week: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          description: 'Filter to only a specific day of the week. Use when calculating multi-week averages for a particular day (e.g. "average Saturday revenue"). Omit to include all days.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_sales_by_category',
    description:
      'Get sales broken down by food/beverage category (e.g. Food, Beverage, Wine, Beer). Shows gross sales, comps, voids, and net sales per category. Supports day_of_week filter for multi-week category averages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        day_of_week: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          description: 'Filter to only a specific day of the week. Omit to include all days.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_server_performance',
    description:
      'Get server/employee productivity: net sales, check count, guest count, average spend per guest, table turns, average check, tip percentage, and total tips. Use for questions about staff performance, top servers, or tip analysis. Supports day_of_week filter for day-specific server analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        day_of_week: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          description: 'Filter to only a specific day of the week. Omit to include all days.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_top_menu_items',
    description:
      'Get top-selling menu items by revenue or quantity sold. Includes item name, category, quantity sold, and total revenue.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        sort_by: {
          type: 'string',
          enum: ['revenue', 'quantity'],
          description: 'Sort by revenue (default) or quantity sold',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_comp_summary',
    description:
      'Get comp/discount summary grouped by reason code. Shows count, total amount, and date range per reason. Use for questions about comps, discounts, voids, or write-offs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_labor_summary',
    description:
      'Get daily labor summary: punch count, employee count, total hours worked, and labor cost. Use for questions about labor, staffing, hours, or payroll. Supports day_of_week filter for day-specific labor averages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        day_of_week: {
          type: 'string',
          enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          description: 'Filter to only a specific day of the week. Omit to include all days.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_reservations',
    description:
      'Get reservation data including guest names, VIP status, party size, and payment totals. Use for questions about reservations, VIPs, or expected covers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_payment_details',
    description:
      'Get payment details for checks including server name, covers, check total, cardholder name, and tip amount. Use for questions about specific checks, tips, or high-value guests.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_logbook',
    description:
      'Get manager daily logbook entries. Contains notes about the day, issues, and observations recorded by the closing manager.',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },

  // --- SUPABASE INTERNAL TABLES ---

  {
    name: 'get_budget_variance',
    description:
      'Get budget vs actual performance: actual sales vs sales budget, labor cost vs labor budget, COGS % vs target. Includes variance amounts, percentages, and severity status (normal/warning/critical). Use for "are we on budget?" or "how are we doing vs target?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_operational_exceptions',
    description:
      'Get current operational issues requiring attention: labor overages, high COGS, low sales, pending invoice approvals, low stock alerts. Returns only items flagged as warning or critical in the last 7 days. Use for "what needs my attention?" or "any issues today?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        venue: VENUE_PARAM,
      },
    },
  },
  {
    name: 'get_demand_forecasts',
    description:
      'Get demand forecasts: predicted covers, revenue, and confidence levels by date and shift type (lunch/dinner). Use for "how busy will we be tomorrow?" or "what covers are predicted for Saturday dinner?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_invoices',
    description:
      'Get invoices with vendor name, amounts, dates, and approval status. Can filter by status (draft, pending_approval, approved, exported). Use for "show me pending invoices" or "what did we spend on vendors this week?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format. Defaults to start_date.',
        },
        status: {
          type: 'string',
          enum: ['draft', 'pending_approval', 'approved', 'exported'],
          description: 'Filter by invoice status. Omit to show all statuses.',
        },
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_current_inventory',
    description:
      'Get current inventory on hand: item names, categories, quantities, unit costs, and total values. Can filter by category or search for specific items. Use for "what inventory do we have?" or "how much flour is on hand?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category (e.g. "produce", "dairy", "meat"). Partial match.',
        },
        search: {
          type: 'string',
          description: 'Search for items by name (e.g. "flour", "salmon"). Partial match.',
        },
        venue: VENUE_PARAM,
      },
    },
  },

  // --- REAL-TIME / PULSE TOOLS ---

  {
    name: 'get_live_sales_pace',
    description:
      'Get live, real-time sales pace for tonight (or today). Returns current revenue, covers, checks, food/bev split, projected end-of-day, comparison vs same day last week, and pace status (on_pace/warning/critical). Use for "how are we pacing?", "how\'s tonight going?", "what are we projected to close at?", or "are we ahead of last week?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        venue: {
          ...VENUE_PARAM,
          description:
            'Venue name to check pace for. REQUIRED — live pace is per-venue.',
        },
      },
      required: ['venue'],
    },
  },
  {
    name: 'get_check_detail',
    description:
      'Look up a specific check by ID and return full details: server, table, guest count, items (food & beverage), payments, tips, comps, and voids. Use when the user wants to see what was on a particular check or needs item-level detail.',
    input_schema: {
      type: 'object' as const,
      properties: {
        check_id: {
          type: 'string',
          description: 'The check ID to look up.',
        },
      },
      required: ['check_id'],
    },
  },
  {
    name: 'search_checks',
    description:
      'Search checks for a venue. Returns checks with server name, table, guest count, revenue, comps, tips, and open/closed status. Use to find checks by server, table, cardholder name, or amount range. Supports single date or date range for multi-day searches (e.g. "find all checks from the Johnsons this month", "checks over $500 last week").',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: {
          type: 'string',
          description: 'Single date in YYYY-MM-DD format. Use for single-day searches. Use today\'s date for current service.',
        },
        start_date: {
          type: 'string',
          description: 'Start date for multi-day searches (YYYY-MM-DD). Use with end_date instead of date.',
        },
        end_date: {
          type: 'string',
          description: 'End date for multi-day searches (YYYY-MM-DD). Defaults to start_date.',
        },
        server_name: {
          type: 'string',
          description: 'Filter by server/employee name (partial match). E.g. "John", "Sarah".',
        },
        table_name: {
          type: 'string',
          description: 'Filter by table name (partial match). E.g. "Table 5", "Bar".',
        },
        cardholder_name: {
          type: 'string',
          description: 'Filter by cardholder/guest name on the payment (partial match). E.g. "Smith", "Johnson". Searches the credit card name on file.',
        },
        min_amount: {
          type: 'number',
          description: 'Minimum check total to include. E.g. 500 for checks over $500.',
        },
        max_amount: {
          type: 'number',
          description: 'Maximum check total to include.',
        },
        venue: {
          ...VENUE_PARAM,
          description: 'Venue name. REQUIRED for check searches.',
        },
      },
      required: ['venue'],
    },
  },
  {
    name: 'get_period_comparison',
    description:
      'Get period-to-date performance with prior period comparison. Supports WTD (week-to-date), PTD (period-to-date), and YTD (year-to-date). Returns net sales, covers, avg check, food/bev split, comps, labor, and variance percentages vs the same window in the prior period. Use for "how\'s our week going?", "are we up or down this period?", "what\'s our YTD vs last year?"',
    input_schema: {
      type: 'object' as const,
      properties: {
        view: {
          type: 'string',
          enum: ['wtd', 'ptd', 'ytd'],
          description: 'Period type: wtd (week-to-date), ptd (period-to-date), or ytd (year-to-date).',
        },
        date: {
          type: 'string',
          description: 'Anchor date in YYYY-MM-DD. Defaults to today.',
        },
        venue: VENUE_PARAM,
      },
      required: ['view'],
    },
  },
];
