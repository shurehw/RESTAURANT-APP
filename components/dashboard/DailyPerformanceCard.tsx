'use client';

import { TrendingUp, TrendingDown, DollarSign, Users, Package } from 'lucide-react';
import { LedgerStripe } from '@/components/ui/LedgerStripe';

interface PerformanceData {
  gross_sales: number;
  cogs_pct: number;
  labor_pct: number;
  prime_cost_pct: number;
  transaction_count: number;
  labor_hours: number;
  sales_per_labor_hour: number;
}

interface VarianceData {
  sales_variance: number;
  sales_status: 'normal' | 'warning' | 'critical';
  cogs_variance_pct: number;
  cogs_status: 'normal' | 'warning' | 'critical';
  labor_variance_pct: number;
  labor_status: 'normal' | 'warning' | 'critical';
  prime_cost_variance_pct: number;
  prime_cost_status: 'normal' | 'warning' | 'critical';
}

interface DailyPerformanceCardProps {
  performance: PerformanceData | null;
  variance: VarianceData | null;
  date: string;
  venueName?: string;
  className?: string;
}

const statusBadges = {
  normal: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800',
};

const ICON_STROKE = 1.25;

export function DailyPerformanceCard({
  performance,
  variance,
  date,
  venueName,
  className = '',
}: DailyPerformanceCardProps) {
  if (!performance) {
    return (
      <div className={`bg-white rounded ${className}`} style={{
        borderRadius: 'var(--radius-sharp)',
        boxShadow: 'var(--shadow-inset)',
        padding: 'var(--card-primary)'
      }}>
        <p className="text-gray-500">No performance data available for {date}</p>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (pct: number) => {
    return `${pct.toFixed(1)}%`;
  };

  const VarianceBadge = ({ value, status }: { value: number; status: string }) => {
    const isPositive = value > 0;
    const Icon = isPositive ? TrendingUp : TrendingDown;

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium ${statusBadges[status as keyof typeof statusBadges]}`}
        style={{
          borderRadius: 'var(--radius-sm)',
          transition: 'var(--transition-snap)'
        }}
      >
        <Icon className="w-3 h-3" strokeWidth={ICON_STROKE} />
        {isPositive ? '+' : ''}{formatPercent(value)}
      </span>
    );
  };

  return (
    <div
      className={`bg-white border ${className}`}
      style={{
        borderRadius: 'var(--radius-sharp)',
        borderColor: 'var(--ledger-gold)',
        backgroundColor: 'white'
      }}
    >
      {/* Header with Ledger Stripe */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-900" style={{ letterSpacing: '0.01em' }}>
              Daily Performance
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {venueName && ` • ${venueName}`}
            </p>
          </div>

          {variance && (
            <span
              className={`px-3 py-1 text-sm font-medium ${statusBadges[variance.prime_cost_status]}`}
              style={{
                borderRadius: 'var(--radius-base)',
                transition: 'var(--transition-snap)'
              }}
            >
              {variance.prime_cost_status === 'normal' ? 'On Track' : variance.prime_cost_status === 'warning' ? 'Needs Attention' : 'Critical'}
            </span>
          )}
        </div>
        <LedgerStripe />
      </div>

      {/* Metrics Grid */}
      <div style={{ padding: '1.5rem' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Gross Sales */}
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2 font-medium">
              <DollarSign className="w-4 h-4" strokeWidth={ICON_STROKE} />
              Gross Sales
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {formatCurrency(performance.gross_sales)}
              </span>
              {variance && (
                <VarianceBadge
                  value={(variance.sales_variance / performance.gross_sales) * 100}
                  status={variance.sales_status}
                />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 font-mono">
              {performance.transaction_count} transactions
            </p>
          </div>

          {/* COGS % */}
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2 font-medium">
              <Package className="w-4 h-4" strokeWidth={ICON_STROKE} />
              COGS %
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {formatPercent(performance.cogs_pct)}
              </span>
              {variance && (
                <VarianceBadge
                  value={variance.cogs_variance_pct}
                  status={variance.cogs_status}
                />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Cost of goods sold
            </p>
          </div>

          {/* Labor % */}
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2 font-medium">
              <Users className="w-4 h-4" strokeWidth={ICON_STROKE} />
              Labor %
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {formatPercent(performance.labor_pct)}
              </span>
              {variance && (
                <VarianceBadge
                  value={variance.labor_variance_pct}
                  status={variance.labor_status}
                />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1 font-mono">
              {performance.labor_hours.toFixed(1)} labor hours
            </p>
          </div>

          {/* Prime Cost % */}
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-2 font-medium">
              <TrendingUp className="w-4 h-4" strokeWidth={ICON_STROKE} />
              Prime Cost %
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold text-gray-900 tabular-nums">
                {formatPercent(performance.prime_cost_pct)}
              </span>
              {variance && (
                <VarianceBadge
                  value={variance.prime_cost_variance_pct}
                  status={variance.prime_cost_status}
                />
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              COGS + Labor
            </p>
          </div>
        </div>

        {/* SPLH with Ledger Stripe */}
        {performance.sales_per_labor_hour > 0 && (
          <div className="mt-6 pt-6">
            <LedgerStripe className="mb-6" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Sales Per Labor Hour</p>
                <p className="text-4xl font-bold text-gray-900 tabular-nums">
                  {formatCurrency(performance.sales_per_labor_hour)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">Avg Ticket</p>
                <p className="text-3xl font-bold text-gray-700 tabular-nums">
                  {formatCurrency(performance.gross_sales / performance.transaction_count)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
