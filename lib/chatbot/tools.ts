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
      'Get daily sales summary including revenue, total checks, covers (guests), comps, voids, and tax for one or more dates. Use this for questions about revenue, sales totals, guest counts, or daily performance.',
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
        venue: VENUE_PARAM,
      },
      required: ['start_date'],
    },
  },
  {
    name: 'get_sales_by_category',
    description:
      'Get sales broken down by food/beverage category (e.g. Food, Beverage, Wine, Beer). Shows gross sales, comps, voids, and net sales per category.',
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
    name: 'get_server_performance',
    description:
      'Get server/employee performance metrics: tickets, covers, net sales, average ticket, average per cover, turn time, tip percentage, and total tips. Use for questions about staff performance, top servers, or tip analysis.',
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
      'Get daily labor summary: punch count, employee count, total hours worked, and labor cost. Use for questions about labor, staffing, hours, or payroll.',
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
];
