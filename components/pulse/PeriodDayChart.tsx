'use client';

import { useMemo, useState } from 'react';
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

interface PeriodDayRow {
  business_date: string;
  net_sales: number;
  covers_count: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtAxis = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

function getDayLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export function PeriodDayChart({ days }: { days: PeriodDayRow[] }) {
  const [cumulative, setCumulative] = useState(false);

  const { dailyData, cumulativeData } = useMemo(() => {
    let cumCurrent = 0;
    let cumPrior = 0;
    const daily: { day: string; Current: number; Prior: number }[] = [];
    const cum: { day: string; Current: number; Prior: number }[] = [];

    for (const d of days) {
      const day = getDayLabel(d.business_date);
      const current = d.net_sales;
      const prior = d.prior_net_sales || 0;
      daily.push({ day, Current: current, Prior: prior });
      cumCurrent += current;
      cumPrior += prior;
      cum.push({ day, Current: cumCurrent, Prior: cumPrior });
    }

    return { dailyData: daily, cumulativeData: cum };
  }, [days]);

  if (days.length === 0) return null;

  const chartData = cumulative ? cumulativeData : dailyData;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
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
            dataKey="Prior"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ r: 4, fill: '#94a3b8', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#94a3b8' }}
          />
          <Area
            type="monotone"
            dataKey="Current"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="#10b981"
            fillOpacity={0.08}
            dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#10b981' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-emerald-500 rounded" />
            <span>Current</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-slate-400" />
            <span>Prior</span>
          </div>
        </div>
        <div className="inline-flex rounded-md border border-border text-xs">
          <button
            onClick={() => setCumulative(false)}
            className={`px-2.5 py-1 rounded-l-md transition-colors ${
              !cumulative ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Daily
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
    </div>
  );
}
