/** Shared types for Pulse period aggregation (used by API routes and components). */

export interface PtdWeekRow {
  week: number;
  label: string;
  start_date: string;
  end_date: string;
  net_sales: number;
  covers: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}

export interface YtdPeriodRow {
  period: number;
  label: string;
  start_date: string;
  end_date: string;
  net_sales: number;
  covers: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}
