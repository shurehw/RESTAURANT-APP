'use client';

import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart,
  Line,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ManagerCommandTrend } from '@/lib/database/signal-analytics';

interface CommandScoreTrendProps {
  managers: ManagerCommandTrend[];
}

export function CommandScoreTrend({ managers }: CommandScoreTrendProps) {
  if (managers.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Activity className="h-5 w-5 text-brass" />
        <div>
          <h2 className="text-lg font-semibold">Command Score Trend</h2>
          <p className="text-xs text-muted-foreground">
            8-week ownership score by manager — lowest first
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {managers.map((manager) => (
          <CommandScoreRow key={manager.manager_id} manager={manager} />
        ))}
      </div>
    </div>
  );
}

function CommandScoreRow({ manager }: { manager: ManagerCommandTrend }) {
  const trendIcon =
    manager.trend === 'improving' ? (
      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
    ) : manager.trend === 'declining' ? (
      <TrendingDown className="h-3.5 w-3.5 text-red-600" />
    ) : (
      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
    );

  const scoreColor =
    manager.current_avg >= 7
      ? 'text-emerald-700 bg-emerald-100'
      : manager.current_avg >= 5
        ? 'text-amber-700 bg-amber-100'
        : 'text-red-700 bg-red-100';

  const lineColor =
    manager.current_avg >= 7
      ? '#059669'
      : manager.current_avg >= 5
        ? '#d97706'
        : '#dc2626';

  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/20 px-3 py-2">
      <span
        className={`inline-flex w-10 items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold ${scoreColor}`}
      >
        {manager.current_avg}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {manager.manager_name || 'Unknown'}
          </span>
          {trendIcon}
        </div>

        {manager.weeks.length >= 2 && (
          <div className="mt-1" style={{ height: 32 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={manager.weeks}>
                <Line
                  type="monotone"
                  dataKey="avg_command_score"
                  stroke={lineColor}
                  strokeWidth={1.5}
                  dot={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.5rem',
                    fontSize: '11px',
                  }}
                  formatter={(value: number) => [`${value}/10`, 'Score']}
                  labelFormatter={(label: string) => label}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <span className="text-xs capitalize text-muted-foreground">
        {manager.trend.replace('_', ' ')}
      </span>
    </div>
  );
}
