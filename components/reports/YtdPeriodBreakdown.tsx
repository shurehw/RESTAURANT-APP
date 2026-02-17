'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

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

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtAxis = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

const fmtNumber = (n: number) => n.toLocaleString('en-US');

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${sStr} – ${eStr}`;
}

export function YtdPeriodBreakdown({ periods }: { periods: YtdPeriodRow[] }) {
  const [cumulative, setCumulative] = useState(false);

  const { periodData, cumulativeData } = useMemo(() => {
    let cumCurrent = 0;
    let cumPrior = 0;
    const perPeriod: { label: string; 'Current Year': number; 'Prior Year': number }[] = [];
    const cum: { label: string; 'Current Year': number; 'Prior Year': number }[] = [];

    for (const p of periods) {
      const current = p.net_sales;
      const prior = p.prior_net_sales || 0;
      perPeriod.push({ label: p.label, 'Current Year': current, 'Prior Year': prior });
      cumCurrent += current;
      cumPrior += prior;
      cum.push({ label: p.label, 'Current Year': cumCurrent, 'Prior Year': cumPrior });
    }

    return { periodData: perPeriod, cumulativeData: cum };
  }, [periods]);

  if (periods.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No period data for this year yet.
      </div>
    );
  }

  // Compute totals
  const totals = periods.reduce(
    (acc, p) => ({
      net_sales: acc.net_sales + p.net_sales,
      covers: acc.covers + p.covers,
      prior_net_sales: acc.prior_net_sales + (p.prior_net_sales || 0),
      prior_covers: acc.prior_covers + (p.prior_covers || 0),
    }),
    { net_sales: 0, covers: 0, prior_net_sales: 0, prior_covers: 0 }
  );

  const chartData = cumulative ? cumulativeData : periodData;

  return (
    <div className="space-y-4">
      {/* Line Chart */}
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              fontSize: '12px',
            }}
            formatter={(value: number) => [fmtCurrency(value)]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="Prior Year"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 4, fill: '#94a3b8', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#94a3b8' }}
          />
          <Area
            type="monotone"
            dataKey="Current Year"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="#10b981"
            fillOpacity={0.08}
            dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#10b981' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend + Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-emerald-500 rounded" />
            <span>Current Year</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-slate-400" />
            <span>Prior Year</span>
          </div>
        </div>
        <div className="inline-flex rounded-md border border-border text-xs">
          <button
            onClick={() => setCumulative(false)}
            className={`px-2.5 py-1 rounded-l-md transition-colors ${
              !cumulative ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Period
          </button>
          <button
            onClick={() => setCumulative(true)}
            className={`px-2.5 py-1 rounded-r-md border-l border-border transition-colors ${
              cumulative ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Cumulative
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Period</th>
              <th className="pb-2 pr-4 font-medium">Dates</th>
              <th className="pb-2 pr-4 font-medium text-right">Net Sales</th>
              <th className="pb-2 pr-4 font-medium text-right">Covers</th>
              <th className="pb-2 pr-4 font-medium text-right">Avg Check</th>
              <th className="pb-2 pr-4 font-medium text-right">LY Sales</th>
              <th className="pb-2 font-medium text-right">Var %</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const avgCheck = p.covers > 0 ? p.net_sales / p.covers : 0;
              const varPct = p.prior_net_sales && p.prior_net_sales > 0
                ? ((p.net_sales - p.prior_net_sales) / p.prior_net_sales) * 100
                : null;

              return (
                <tr key={p.period} className="border-b border-border/50 hover:bg-muted/50">
                  <td className="py-2 pr-4 font-medium">{p.label}</td>
                  <td className="py-2 pr-4 text-muted-foreground text-xs">{formatDateRange(p.start_date, p.end_date)}</td>
                  <td className="py-2 pr-4 text-right font-medium tabular-nums">{fmtCurrency(p.net_sales)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtNumber(p.covers)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{avgCheck > 0 ? fmtCurrency(avgCheck) : '—'}</td>
                  <td className="py-2 pr-4 text-right text-muted-foreground tabular-nums">
                    {p.prior_net_sales != null ? fmtCurrency(p.prior_net_sales) : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {varPct != null ? (
                      <span className="inline-flex items-center gap-0.5">
                        {varPct >= 0 ? (
                          <TrendingUp className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        )}
                        <span className={varPct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                          {varPct > 0 ? '+' : ''}{varPct.toFixed(1)}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="border-t-2 font-semibold">
              <td className="py-2 pr-4">YTD Total</td>
              <td className="py-2 pr-4"></td>
              <td className="py-2 pr-4 text-right tabular-nums">{fmtCurrency(totals.net_sales)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{fmtNumber(totals.covers)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {totals.covers > 0 ? fmtCurrency(totals.net_sales / totals.covers) : '—'}
              </td>
              <td className="py-2 pr-4 text-right text-muted-foreground tabular-nums">
                {totals.prior_net_sales > 0 ? fmtCurrency(totals.prior_net_sales) : '—'}
              </td>
              <td className="py-2 text-right">
                {totals.prior_net_sales > 0 ? (
                  <span className={
                    ((totals.net_sales - totals.prior_net_sales) / totals.prior_net_sales) >= 0
                      ? 'text-emerald-500' : 'text-red-500'
                  }>
                    {((totals.net_sales - totals.prior_net_sales) / totals.prior_net_sales * 100) > 0 ? '+' : ''}
                    {((totals.net_sales - totals.prior_net_sales) / totals.prior_net_sales * 100).toFixed(1)}%
                  </span>
                ) : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
