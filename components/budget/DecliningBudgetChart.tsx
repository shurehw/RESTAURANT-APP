/**
 * components/budget/DecliningBudgetChart.tsx
 * Client component for declining budget visualization.
 */

'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface BudgetDataPoint {
  budget_id: string;
  txn_date: string;
  day_offset: number;
  initial_budget: number;
  cumulative_spend: number;
  remaining_budget: number;
}

export function DecliningBudgetChart({
  venueId,
  departmentId,
  periodStart,
}: {
  venueId: string;
  departmentId: string;
  periodStart: string;
}) {
  const [data, setData] = useState<BudgetDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [venueId, departmentId, periodStart]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/budget?venue=${venueId}&dept=${departmentId}&start=${periodStart}`
      );
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error loading budget data:', err);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    const csv =
      'Date,Initial Budget,Cumulative Spend,Remaining Budget\n' +
      data
        .map(
          (d) =>
            `${d.txn_date},${d.initial_budget},${d.cumulative_spend},${d.remaining_budget}`
        )
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget_${periodStart}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-muted-foreground">Loading budget data...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-muted-foreground">
          No budget data found for this period.
        </p>
      </div>
    );
  }

  const initialBudget = data[0]?.initial_budget || 0;
  const currentDay = data[data.length - 1];
  const spentToDate = currentDay?.cumulative_spend || 0;
  const remaining = currentDay?.remaining_budget || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-1">Initial Budget</p>
          <p className="text-2xl font-bold">{formatCurrency(initialBudget)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-1">Spent to Date</p>
          <p className="text-2xl font-bold text-destructive">
            {formatCurrency(spentToDate)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground mb-1">Remaining</p>
          <p
            className={`text-2xl font-bold ${
              remaining < 0 ? 'text-destructive' : 'text-green-600'
            }`}
          >
            {formatCurrency(remaining)}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Daily Trend</h3>
          <Button onClick={exportCSV} variant="outline" size="sm">
            Export CSV
          </Button>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="txn_date"
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="remaining_budget"
              stroke="#2563eb"
              name="Remaining Budget"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="cumulative_spend"
              stroke="#dc2626"
              name="Cumulative Spend"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium text-sm">Date</th>
              <th className="text-right p-3 font-medium text-sm">Daily Spend</th>
              <th className="text-right p-3 font-medium text-sm">
                Cumulative Spend
              </th>
              <th className="text-right p-3 font-medium text-sm">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const dailySpend =
                idx === 0
                  ? row.cumulative_spend
                  : row.cumulative_spend - data[idx - 1].cumulative_spend;

              return (
                <tr key={row.txn_date} className="border-b last:border-0">
                  <td className="p-3 text-sm">
                    {new Date(row.txn_date).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right font-mono text-sm">
                    {formatCurrency(dailySpend)}
                  </td>
                  <td className="p-3 text-right font-mono text-sm">
                    {formatCurrency(row.cumulative_spend)}
                  </td>
                  <td
                    className={`p-3 text-right font-mono text-sm ${
                      row.remaining_budget < 0
                        ? 'text-destructive font-bold'
                        : ''
                    }`}
                  >
                    {formatCurrency(row.remaining_budget)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
