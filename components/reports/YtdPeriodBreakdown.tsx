'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

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

const fmtNumber = (n: number) => n.toLocaleString('en-US');

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sStr = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const eStr = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${sStr} – ${eStr}`;
}

export function YtdPeriodBreakdown({ periods }: { periods: YtdPeriodRow[] }) {
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

  const maxSales = Math.max(...periods.map(p => Math.max(p.net_sales, p.prior_net_sales || 0)), 1);

  return (
    <div className="space-y-4">
      {/* Bar Chart */}
      <div className="flex items-end gap-1 h-36">
        {periods.map((p) => {
          const currentPct = (p.net_sales / maxSales) * 100;
          const priorPct = p.prior_net_sales ? (p.prior_net_sales / maxSales) * 100 : 0;

          return (
            <div key={p.period} className="flex-1 flex flex-col items-center gap-px">
              <div className="flex items-end gap-px w-full justify-center" style={{ height: '100%' }}>
                {priorPct > 0 && (
                  <div
                    className="bg-muted-foreground/20 rounded-t flex-1 max-w-6 transition-all"
                    style={{ height: `${priorPct}%`, minHeight: 2 }}
                    title={`LY: ${p.prior_net_sales != null ? fmtCurrency(p.prior_net_sales) : 'N/A'}`}
                  />
                )}
                <div
                  className="bg-emerald-500 rounded-t flex-1 max-w-6 transition-all"
                  style={{ height: `${currentPct}%`, minHeight: currentPct > 0 ? 2 : 0 }}
                  title={`${p.label}: ${fmtCurrency(p.net_sales)}`}
                />
              </div>
              <span className="text-[10px] text-muted-foreground font-medium mt-1">{p.label}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span>Current Year</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-muted-foreground/20" />
          <span>Prior Year</span>
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
