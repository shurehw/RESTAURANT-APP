'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

interface AccuracyMetrics {
  venue_id: string;
  venue_name: string;
  total_days: number;
  covers_mape: number;
  revenue_mape: number;
  mae: number;
  avg_bias: number;
  within_10pct: number;
  within_20pct: number;
  corrected_mape?: number;
  corrected_within_10pct?: number;
  bias_offset?: number;
  day_type_offsets?: Record<string, number>;
}

interface AccuracySummary {
  total_forecasts: number;
  matched_with_actuals: number;
  total_days_analyzed: number;
  avg_mape: number;
  avg_within_10pct: number;
  avg_within_20pct: number;
  rating: string;
  corrected_avg_mape: number;
  corrected_avg_within_10pct: number;
  corrected_rating: string;
  mape_improvement: number;
}

function mapeColor(mape: number): string {
  if (mape < 10) return 'text-emerald-600 dark:text-emerald-400';
  if (mape < 15) return 'text-emerald-600/70 dark:text-emerald-400/70';
  if (mape < 20) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500';
}

function mapeBar(mape: number): string {
  if (mape < 10) return 'bg-emerald-500';
  if (mape < 15) return 'bg-emerald-400';
  if (mape < 20) return 'bg-amber-400';
  return 'bg-red-400';
}

export function ForecastAccuracy({ venueId }: { venueId: string }) {
  const [data, setData] = useState<{ metrics: AccuracyMetrics[]; summary: AccuracySummary | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/forecast/accuracy`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="p-6 mb-6">
        <div className="text-sm text-muted-foreground">Loading accuracy metrics...</div>
      </Card>
    );
  }

  if (!data?.summary) return null;

  const { summary, metrics } = data;
  const venueMetric = metrics.find(m => m.venue_id === venueId);
  const improvement = summary.mape_improvement;

  return (
    <Card className="mb-6">
      <CardHeader
        className="cursor-pointer border-b border-brass/20"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-brass" />
            Forecast Accuracy
          </div>
          <div className="flex items-center gap-3 text-sm font-normal">
            <span className={mapeColor(summary.corrected_avg_mape)}>
              {summary.corrected_avg_mape}% MAPE
            </span>
            <span className="text-muted-foreground">
              {summary.corrected_avg_within_10pct}% within 10%
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-4">
          {/* Summary row */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <div className="text-xs text-muted-foreground">MAPE (Corrected)</div>
              <div className={`text-xl font-bold ${mapeColor(summary.corrected_avg_mape)}`}>
                {summary.corrected_avg_mape}%
              </div>
              {improvement > 0 && (
                <div className="text-xs text-emerald-600 flex items-center gap-0.5">
                  <TrendingDown className="h-3 w-3" />
                  {improvement}pt improvement from bias correction
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Within 10%</div>
              <div className="text-xl font-bold">{summary.corrected_avg_within_10pct}%</div>
              <div className="text-xs text-muted-foreground">of forecasts</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Within 20%</div>
              <div className="text-xl font-bold">{summary.avg_within_20pct}%</div>
              <div className="text-xs text-muted-foreground">of forecasts</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Days Analyzed</div>
              <div className="text-xl font-bold">{summary.total_days_analyzed}</div>
              <div className="text-xs text-muted-foreground">{summary.rating}</div>
            </div>
          </div>

          {/* Per-venue breakdown */}
          {metrics.length > 1 && (
            <>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">By Venue</div>
              <div className="space-y-2">
                {metrics
                  .sort((a, b) => a.covers_mape - b.covers_mape)
                  .map(m => (
                  <div key={m.venue_id} className={`flex items-center gap-3 ${m.venue_id === venueId ? 'font-medium' : ''}`}>
                    <div className="w-32 text-sm truncate">{m.venue_name}</div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${mapeBar(m.corrected_mape ?? m.covers_mape)}`}
                        style={{ width: `${Math.min(100, ((m.corrected_mape ?? m.covers_mape) / 30) * 100)}%` }}
                      />
                    </div>
                    <div className={`w-16 text-right text-sm ${mapeColor(m.corrected_mape ?? m.covers_mape)}`}>
                      {(m.corrected_mape ?? m.covers_mape)}%
                    </div>
                    <div className="w-20 text-right text-xs text-muted-foreground">
                      {m.within_10pct}% hit
                    </div>
                    <div className="w-16 text-right text-xs text-muted-foreground">
                      {m.total_days}d
                    </div>
                    {m.avg_bias !== 0 && (
                      <div className={`w-20 text-right text-xs ${m.avg_bias > 0 ? 'text-amber-600' : 'text-blue-600'}`}>
                        {m.avg_bias > 0 ? '+' : ''}{m.avg_bias} bias
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Day-type offsets for selected venue */}
          {venueMetric?.day_type_offsets && Object.keys(venueMetric.day_type_offsets).length > 0 && (
            <div className="mt-4 pt-3 border-t">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Bias Corrections ({venueMetric.venue_name})
              </div>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(venueMetric.day_type_offsets).map(([day, offset]) => (
                  <div key={day} className="text-xs px-2 py-1 rounded bg-muted">
                    <span className="capitalize">{day}</span>:{' '}
                    <span className={Number(offset) > 0 ? 'text-emerald-600' : 'text-red-500'}>
                      {Number(offset) > 0 ? '+' : ''}{offset}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
