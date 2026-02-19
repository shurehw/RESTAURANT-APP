'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, AlertTriangle, Loader2 } from 'lucide-react';

interface IntervalForecast {
  business_date: string;
  day_type: string;
  interval_start: string; // "17:00:00"
  covers_predicted: number;
  revenue_predicted: number;
  pct_of_daily: number;
  daily_total_covers: number;
  daily_total_revenue: number;
  sample_size: number;
}

interface IntervalDrilldownProps {
  venueId: string;
  businessDate: string;
  dayType: string;
  openHour?: number; // venue open hour for sort ordering (default 15)
}

/** Format TIME string "17:00:00" → "5:00 PM" */
function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Sort intervals starting from open_hour, wrapping past midnight */
function sortIntervals(intervals: IntervalForecast[], openHour: number): IntervalForecast[] {
  return [...intervals].sort((a, b) => {
    const ha = parseInt(a.interval_start.split(':')[0]);
    const hb = parseInt(b.interval_start.split(':')[0]);
    // Shift hours so openHour becomes 0 for sorting
    const adjA = ha >= openHour ? ha - openHour : ha + 24 - openHour;
    const adjB = hb >= openHour ? hb - openHour : hb + 24 - openHour;
    if (adjA !== adjB) return adjA - adjB;
    // Same hour, compare minutes
    const ma = parseInt(a.interval_start.split(':')[1]);
    const mb = parseInt(b.interval_start.split(':')[1]);
    return ma - mb;
  });
}

export function IntervalDrilldown({ venueId, businessDate, dayType, openHour = 15 }: IntervalDrilldownProps) {
  const [intervals, setIntervals] = useState<IntervalForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/forecast/intervals?venueId=${venueId}&startDate=${businessDate}&endDate=${businessDate}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const dateIntervals = data.intervals?.[businessDate] || [];
        setIntervals(sortIntervals(dateIntervals, openHour));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [venueId, businessDate, openHour]);

  if (loading) {
    return (
      <div className="py-6 flex items-center justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading interval forecast...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-sm text-red-500">
        Failed to load intervals: {error}
      </div>
    );
  }

  if (intervals.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-muted-foreground">
        No interval data available for this date. Curves need to be computed first.
      </div>
    );
  }

  const maxCovers = Math.max(...intervals.map(i => i.covers_predicted), 1);

  return (
    <div className="py-3 px-2">
      {/* Bar Chart */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            30-Min Demand Curve — {dayType}
          </span>
        </div>

        <div className="flex items-end gap-px" style={{ height: 120 }}>
          {intervals.map((interval, i) => {
            const height = maxCovers > 0
              ? (interval.covers_predicted / maxCovers) * 100
              : 0;
            const isLowConfidence = interval.sample_size < 5;

            return (
              <div
                key={i}
                className="flex-1 relative group"
                style={{ minWidth: 0 }}
              >
                <div
                  className={`w-full rounded-t transition-colors ${
                    isLowConfidence
                      ? 'bg-opsos-sage-300 hover:bg-opsos-sage-400'
                      : 'bg-opsos-sage-600 hover:bg-opsos-sage-700'
                  }`}
                  style={{ height: `${Math.max(height, 2)}%` }}
                />

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                    <div className="font-medium">{formatTime(interval.interval_start)}</div>
                    <div>{interval.covers_predicted} covers</div>
                    <div>${interval.revenue_predicted.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
                    <div className="text-gray-400">{(interval.pct_of_daily * 100).toFixed(1)}% of day</div>
                    {isLowConfidence && (
                      <div className="text-amber-400 mt-0.5">Low confidence ({interval.sample_size} samples)</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels — show every 2nd label to avoid crowding */}
        <div className="flex gap-px text-[9px] text-muted-foreground mt-1">
          {intervals.map((interval, i) => (
            <div key={i} className="flex-1 text-center" style={{ minWidth: 0 }}>
              {i % 2 === 0 ? formatTime(interval.interval_start).replace(' ', '\n').split('\n')[0] : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Interval Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="pb-1.5 text-left font-medium">Time</th>
              <th className="pb-1.5 text-right font-medium">Covers</th>
              <th className="pb-1.5 text-right font-medium">Revenue</th>
              <th className="pb-1.5 text-right font-medium">% of Day</th>
              <th className="pb-1.5 text-right font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-muted/50">
            {intervals.map((interval, i) => {
              const isLowConfidence = interval.sample_size < 5;
              return (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="py-1.5 font-mono">{formatTime(interval.interval_start)}</td>
                  <td className="py-1.5 text-right font-mono font-medium">{interval.covers_predicted}</td>
                  <td className="py-1.5 text-right font-mono text-muted-foreground">
                    ${interval.revenue_predicted.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {(interval.pct_of_daily * 100).toFixed(1)}%
                  </td>
                  <td className="py-1.5 text-right">
                    {isLowConfidence ? (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        <AlertTriangle className="w-3 h-3" />
                        {interval.sample_size}d
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{interval.sample_size}d</span>
                    )}
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
