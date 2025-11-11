/**
 * OpsOS Budget Chart Component
 * Declining budget visualization with Recharts
 */

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface BudgetChartProps {
  data: Array<{
    day: string;
    budget: number;
    actual: number;
    remaining: number;
  }>;
}

export function BudgetChart({ data }: BudgetChartProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          stroke="hsl(var(--muted-foreground))"
          style={{ fontSize: 12 }}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          style={{ fontSize: 12, fontFamily: "var(--font-ibm-plex-mono)" }}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
            fontFamily: "var(--font-ibm-plex-mono)",
          }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
        />
        <Legend
          wrapperStyle={{
            paddingTop: "20px",
            fontSize: "14px",
          }}
        />
        <ReferenceLine y={0} stroke="hsl(var(--error))" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="budget"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          name="Budget Limit"
        />
        <Line
          type="monotone"
          dataKey="actual"
          stroke="var(--opsos-brass)"
          strokeWidth={3}
          dot={{ r: 4, fill: "var(--opsos-brass)" }}
          name="Actual Spend"
        />
        <Line
          type="monotone"
          dataKey="remaining"
          stroke="var(--opsos-sage)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--opsos-sage)" }}
          name="Remaining"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
