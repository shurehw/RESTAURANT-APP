/**
 * Anthropic tool definitions for the OpsOS chatbot.
 * Each tool maps 1:1 to a query function in queries.ts.
 */

import type Anthropic from '@anthropic-ai/sdk';

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
      },
      required: ['start_date'],
    },
  },
];
