'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

interface PeriodDayRow {
  business_date: string;
  net_sales: number;
  covers_count: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtNumber = (n: number) => n.toLocaleString('en-US');

function formatDateRow(dateStr: string): { day: string; date: string } {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return {
    day: d.toLocaleDateString('en-US', { weekday: 'short' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

export function PeriodDayTable({ days }: { days: PeriodDayRow[] }) {
  if (days.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No data for this period yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Date</th>
            <th className="pb-2 pr-4 font-medium">Day</th>
            <th className="pb-2 pr-4 font-medium text-right">Net Sales</th>
            <th className="pb-2 pr-4 font-medium text-right">Covers</th>
            <th className="pb-2 pr-4 font-medium text-right">Avg Check</th>
            <th className="pb-2 pr-4 font-medium text-right">Prior Sales</th>
            <th className="pb-2 pr-4 font-medium text-right">$ Change</th>
            <th className="pb-2 font-medium text-right">Var %</th>
          </tr>
        </thead>
        <tbody>
          {days.map((row) => {
            const { day, date } = formatDateRow(row.business_date);
            const avgCheck = row.covers_count > 0 ? row.net_sales / row.covers_count : 0;
            const dollarChange = row.prior_net_sales != null ? row.net_sales - row.prior_net_sales : null;
            const varPct = row.prior_net_sales && row.prior_net_sales > 0
              ? ((row.net_sales - row.prior_net_sales) / row.prior_net_sales) * 100
              : null;

            return (
              <tr key={row.business_date} className="border-b border-border/50 hover:bg-muted/50">
                <td className="py-2 pr-4 text-muted-foreground">{date}</td>
                <td className="py-2 pr-4 font-medium">{day}</td>
                <td className="py-2 pr-4 text-right font-medium">{fmtCurrency(row.net_sales)}</td>
                <td className="py-2 pr-4 text-right">{fmtNumber(row.covers_count)}</td>
                <td className="py-2 pr-4 text-right">{avgCheck > 0 ? fmtCurrency(avgCheck) : '—'}</td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {row.prior_net_sales != null ? fmtCurrency(row.prior_net_sales) : '—'}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {dollarChange != null ? (
                    <span className={dollarChange >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                      {dollarChange > 0 ? '+' : ''}{fmtCurrency(dollarChange)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
        </tbody>
      </table>
    </div>
  );
}
