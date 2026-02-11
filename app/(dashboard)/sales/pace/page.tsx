/**
 * Live Pulse — Sales Pace Dashboard
 * Real-time sales tracking during service hours.
 * Compares current revenue and covers against forecast + SDLW.
 * Auto-refreshes every 5 minutes to match polling interval.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import {
  DollarSign,
  Users,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Loader2,
  RefreshCw,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ══════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════

interface SalesSnapshot {
  id: string;
  venue_id: string;
  business_date: string;
  snapshot_at: string;
  gross_sales: number;
  net_sales: number;
  food_sales: number;
  beverage_sales: number;
  checks_count: number;
  covers_count: number;
  comps_total: number;
  voids_total: number;
  avg_check: number | null;
  bev_pct: number | null;
}

interface PaceData {
  current: SalesSnapshot | null;
  snapshots: SalesSnapshot[];
  forecast: {
    covers_predicted: number;
    revenue_predicted: number;
    covers_lower: number;
    covers_upper: number;
  } | null;
  sdlw: {
    gross_sales: number;
    net_sales: number;
    covers_count: number;
    checks_count: number;
    food_sales: number;
    beverage_sales: number;
  } | null;
  settings: {
    service_start_hour: number;
    service_end_hour: number;
    pace_warning_pct: number;
    pace_critical_pct: number;
  } | null;
  pace: {
    revenue_pct: number | null;
    covers_pct: number | null;
    projected_revenue: number;
    projected_covers: number;
    revenue_target: number;
    covers_target: number;
    revenue_status: string;
    covers_status: string;
    status: string;
  };
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getBusinessDate(): string {
  const now = new Date();
  if (now.getHours() < 5) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split('T')[0];
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  on_pace: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: 'On Pace' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Warning' },
  critical: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Critical' },
  no_target: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'No Target' },
};

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function PaceBadge({ status }: { status: string }) {
  const config = STATUS_COLORS[status] || STATUS_COLORS.no_target;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      <Activity className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function GaugeCard({
  title,
  icon: Icon,
  current,
  target,
  projected,
  pct,
  status,
  sdlw,
  format = 'currency',
}: {
  title: string;
  icon: any;
  current: number;
  target: number;
  projected: number;
  pct: number | null;
  status: string;
  sdlw: number | null;
  format?: 'currency' | 'number';
}) {
  const fmt = format === 'currency' ? formatCurrency : formatNumber;
  const config = STATUS_COLORS[status] || STATUS_COLORS.no_target;
  const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${config.text}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{fmt(current)}</div>

        {/* Progress bar */}
        {target > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{pct != null ? `${pct}%` : '—'} of target</span>
              <span>{fmt(target)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  status === 'critical' ? 'bg-red-500' :
                  status === 'warning' ? 'bg-amber-500' :
                  'bg-emerald-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Projected EOD */}
        {projected > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Projected EOD: <span className="font-medium text-foreground">{fmt(projected)}</span>
          </div>
        )}

        {/* SDLW comparison */}
        {sdlw != null && sdlw > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">SDLW:</span>
            <span className="font-medium">{fmt(sdlw)}</span>
            {current > 0 && (
              <>
                {current >= sdlw ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryMixCard({
  foodSales,
  bevSales,
  sdlwFood,
  sdlwBev,
}: {
  foodSales: number;
  bevSales: number;
  sdlwFood: number | null;
  sdlwBev: number | null;
}) {
  const total = foodSales + bevSales;
  const foodPct = total > 0 ? (foodSales / total) * 100 : 0;
  const bevPct = total > 0 ? (bevSales / total) * 100 : 0;

  const sdlwTotal = (sdlwFood || 0) + (sdlwBev || 0);
  const sdlwBevPct = sdlwTotal > 0 ? ((sdlwBev || 0) / sdlwTotal) * 100 : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Category Mix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-3.5 w-3.5 text-orange-500" />
              <span>Food</span>
            </div>
            <div className="text-right">
              <span className="font-medium">{formatCurrency(foodSales)}</span>
              <span className="text-muted-foreground ml-1">({foodPct.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Wine className="h-3.5 w-3.5 text-purple-500" />
              <span>Beverage</span>
            </div>
            <div className="text-right">
              <span className="font-medium">{formatCurrency(bevSales)}</span>
              <span className="text-muted-foreground ml-1">({bevPct.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Stacked bar */}
        {total > 0 && (
          <div className="h-3 rounded-full bg-muted overflow-hidden flex">
            <div className="bg-orange-500 transition-all" style={{ width: `${foodPct}%` }} />
            <div className="bg-purple-500 transition-all" style={{ width: `${bevPct}%` }} />
          </div>
        )}

        {sdlwBevPct != null && (
          <div className="text-xs text-muted-foreground">
            SDLW bev mix: {sdlwBevPct.toFixed(0)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotTable({ snapshots }: { snapshots: SalesSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No snapshots yet. Data will appear once polling begins during service hours.
      </div>
    );
  }

  // Show most recent first
  const sorted = [...snapshots].reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Time</th>
            <th className="pb-2 pr-4 font-medium text-right">Net Sales</th>
            <th className="pb-2 pr-4 font-medium text-right">Covers</th>
            <th className="pb-2 pr-4 font-medium text-right">Checks</th>
            <th className="pb-2 pr-4 font-medium text-right">Avg Check</th>
            <th className="pb-2 pr-4 font-medium text-right">Bev %</th>
            <th className="pb-2 font-medium text-right">Comps</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatTime(s.snapshot_at)}
                </div>
              </td>
              <td className="py-2 pr-4 text-right font-medium">{formatCurrency(s.net_sales)}</td>
              <td className="py-2 pr-4 text-right">{formatNumber(s.covers_count)}</td>
              <td className="py-2 pr-4 text-right">{formatNumber(s.checks_count)}</td>
              <td className="py-2 pr-4 text-right">
                {s.avg_check != null ? formatCurrency(s.avg_check) : '—'}
              </td>
              <td className="py-2 pr-4 text-right">
                {s.bev_pct != null ? `${s.bev_pct.toFixed(0)}%` : '—'}
              </td>
              <td className="py-2 text-right">{formatCurrency(s.comps_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Simple cumulative chart using HTML/CSS (no charting library needed)
function CumulativeChart({
  snapshots,
  forecastRevenue,
  sdlwRevenue,
}: {
  snapshots: SalesSnapshot[];
  forecastRevenue: number | null;
  sdlwRevenue: number | null;
}) {
  if (snapshots.length === 0) return null;

  const maxValue = Math.max(
    ...snapshots.map((s) => s.net_sales),
    forecastRevenue || 0,
    sdlwRevenue || 0,
    1
  );

  // Compute bar heights
  const barWidth = Math.max(4, Math.min(20, Math.floor(600 / snapshots.length)));

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-px h-40 overflow-x-auto">
        {snapshots.map((s, i) => {
          const heightPct = (s.net_sales / maxValue) * 100;
          const isLatest = i === snapshots.length - 1;
          return (
            <div key={s.id} className="flex flex-col items-center" style={{ minWidth: barWidth }}>
              <div
                className={`rounded-t transition-all ${isLatest ? 'bg-emerald-500' : 'bg-emerald-500/40'}`}
                style={{ width: barWidth - 1, height: `${heightPct}%` }}
                title={`${formatTime(s.snapshot_at)}: ${formatCurrency(s.net_sales)}`}
              />
            </div>
          );
        })}
      </div>

      {/* Reference lines legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span>Actual</span>
        </div>
        {forecastRevenue != null && forecastRevenue > 0 && (
          <div className="flex items-center gap-1.5">
            <span>Forecast EOD: {formatCurrency(forecastRevenue)}</span>
          </div>
        )}
        {sdlwRevenue != null && sdlwRevenue > 0 && (
          <div className="flex items-center gap-1.5">
            <span>SDLW EOD: {formatCurrency(sdlwRevenue)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function LivePulsePage() {
  const { selectedVenue } = useVenue();
  const [data, setData] = useState<PaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!selectedVenue) return;

    setLoading(true);
    setError(null);

    try {
      const date = getBusinessDate();
      const res = await fetch(`/api/sales/pace?venue_id=${selectedVenue.id}&date=${date}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVenue]);

  // Fetch on mount and venue change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Pulse</h1>
          <p className="text-muted-foreground text-sm">
            Real-time sales pace vs. forecast
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Updated {formatTime(lastRefreshed.toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <VenueQuickSwitcher />
        </div>
      </div>

      {/* No venue selected */}
      {!selectedVenue && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a venue to view live sales data.
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-red-500/50">
          <CardContent className="py-4 text-sm text-red-500">
            Failed to load pace data: {error}
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && !data && selectedVenue && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Main content */}
      {data && selectedVenue && (
        <>
          {/* Overall status */}
          <div className="flex items-center gap-3">
            <PaceBadge status={data.pace.status} />
            {data.current && (
              <span className="text-sm text-muted-foreground">
                as of {formatTime(data.current.snapshot_at)}
              </span>
            )}
          </div>

          {/* Hero gauges */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <GaugeCard
              title="Net Revenue"
              icon={DollarSign}
              current={data.current?.net_sales ?? 0}
              target={data.pace.revenue_target}
              projected={data.pace.projected_revenue}
              pct={data.pace.revenue_pct}
              status={data.pace.revenue_status}
              sdlw={data.sdlw?.net_sales ?? null}
            />
            <GaugeCard
              title="Covers"
              icon={Users}
              current={data.current?.covers_count ?? 0}
              target={data.pace.covers_target}
              projected={data.pace.projected_covers}
              pct={data.pace.covers_pct}
              status={data.pace.covers_status}
              sdlw={data.sdlw?.covers_count ?? null}
              format="number"
            />
            <GaugeCard
              title="Avg Check"
              icon={TrendingUp}
              current={data.current?.avg_check ?? 0}
              target={0}
              projected={0}
              pct={null}
              status="no_target"
              sdlw={data.sdlw ? data.sdlw.gross_sales / Math.max(data.sdlw.checks_count, 1) : null}
            />
            <CategoryMixCard
              foodSales={data.current?.food_sales ?? 0}
              bevSales={data.current?.beverage_sales ?? 0}
              sdlwFood={data.sdlw?.food_sales ?? null}
              sdlwBev={data.sdlw?.beverage_sales ?? null}
            />
          </div>

          {/* Cumulative chart */}
          {data.snapshots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Revenue Over Service</CardTitle>
              </CardHeader>
              <CardContent>
                <CumulativeChart
                  snapshots={data.snapshots}
                  forecastRevenue={data.forecast?.revenue_predicted ?? null}
                  sdlwRevenue={data.sdlw?.net_sales ?? null}
                />
              </CardContent>
            </Card>
          )}

          {/* Snapshot table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Snapshots</CardTitle>
            </CardHeader>
            <CardContent>
              <SnapshotTable snapshots={data.snapshots} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
