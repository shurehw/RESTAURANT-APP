/**
 * Live Pulse — Sales Pace Dashboard
 * Real-time sales tracking during service hours.
 * Compares current revenue and covers against forecast + SDLW.
 * Auto-refreshes every 5 minutes to match polling interval.
 * Supports single-venue detail and group-wide summary views.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VenueQuickSwitcher } from '@/components/ui/VenueQuickSwitcher';
import { useVenue } from '@/components/providers/VenueProvider';
import { createClient } from '@/lib/supabase/client';
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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckListSheet } from '@/components/pulse/CheckListSheet';
import { CheckDetailDialog } from '@/components/pulse/CheckDetailDialog';
import { LaborCard } from '@/components/pulse/LaborCard';
import { CompCard } from '@/components/pulse/CompCard';
import { PeriodGaugeCard, PeriodCategoryMixCard } from '@/components/pulse/PeriodGaugeCard';
import { PeriodDayChart } from '@/components/pulse/PeriodDayChart';
import { PeriodDayTable } from '@/components/pulse/PeriodDayTable';
import { PeriodWeekBreakdown } from '@/components/reports/PeriodWeekBreakdown';
import type { PtdWeekRow } from '@/components/reports/PeriodWeekBreakdown';
import { YtdPeriodBreakdown } from '@/components/reports/YtdPeriodBreakdown';
import type { YtdPeriodRow } from '@/components/reports/YtdPeriodBreakdown';
import { Briefcase, ShieldAlert } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts';

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
  // Labor enrichment (from poll)
  labor_cost: number;
  labor_hours: number;
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
  sdly: {
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
    revenue_target: number;
    covers_target: number;
    revenue_status: string;
    covers_status: string;
    status: string;
    target_source: 'forecast' | 'sdlw' | 'none';
  };
}

interface GroupVenuePace extends PaceData {
  venue_id: string;
  venue_name: string;
}

interface GroupData {
  date: string;
  venues: GroupVenuePace[];
  totals: {
    net_sales: number;
    covers: number;
    checks: number;
    food_sales: number;
    beverage_sales: number;
    revenue_target: number;
    covers_target: number;
    sdlw_net: number;
  };
}

interface EnrichmentLaborData {
  total_hours: number;
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  covers_per_labor_hour: number | null;
  employee_count: number;
  punch_count: number;
  foh: { hours: number; cost: number; employee_count: number } | null;
  boh: { hours: number; cost: number; employee_count: number } | null;
  other: { hours: number; cost: number; employee_count: number } | null;
}

interface EnrichmentCompData {
  total: number;
  pct: number;
  net_sales: number;
  exception_count: number;
  critical_count: number;
  warning_count: number;
  top_exceptions: Array<{
    type: string;
    severity: string;
    server: string;
    comp_total: number;
    message: string;
  }>;
}

interface EnrichmentData {
  venue_id: string;
  venue_name: string;
  labor: EnrichmentLaborData | null;
  comps: EnrichmentCompData | null;
}

interface GroupEnrichmentData {
  venues: EnrichmentData[];
  totals: {
    labor_cost: number;
    labor_pct: number;
    total_hours: number;
    ot_hours: number;
    employee_count: number;
    splh: number;
    comp_total: number;
    comp_pct: number;
    exception_count: number;
    critical_count: number;
    net_sales: number;
  } | null;
}

type PulseViewMode = 'today' | 'wtd' | 'ptd' | 'ytd';

interface PeriodAggregation {
  net_sales: number;
  gross_sales: number;
  food_sales: number;
  beverage_sales: number;
  comps_total: number;
  voids_total: number;
  checks_count: number;
  covers_count: number;
  days_count: number;
  avg_check: number;
  beverage_pct: number;
}

interface PeriodLaborAggregation {
  labor_cost: number;
  total_hours: number;
  ot_hours: number;
  employee_count: number;
  labor_pct: number;
  splh: number;
  foh_cost: number;
  boh_cost: number;
}

interface PeriodDayRow {
  business_date: string;
  net_sales: number;
  covers_count: number;
  prior_net_sales: number | null;
  prior_covers: number | null;
}

interface VarianceSet {
  net_sales_pct: number | null;
  covers_pct: number | null;
  avg_check_pct: number | null;
  labor_pct_delta: number | null;
  comp_pct_delta: number | null;
}

interface CompByReason {
  reason: string;
  count: number;
  total: number;
}

interface VenuePeriodData {
  venue_id: string;
  venue_name: string;
  current: PeriodAggregation;
  prior: PeriodAggregation;
  secondary_prior: PeriodAggregation | null;
  labor_current: PeriodLaborAggregation | null;
  labor_prior: PeriodLaborAggregation | null;
  variance: VarianceSet;
  secondary_variance: VarianceSet | null;
  days: PeriodDayRow[];
  comp_by_reason?: CompByReason[];
}

interface PeriodResponse {
  view: PulseViewMode;
  date: string;
  period_start: string;
  period_end: string;
  prior_start: string;
  prior_end: string;
  prior_label?: string;
  secondary_prior_start?: string | null;
  secondary_prior_end?: string | null;
  secondary_prior_label?: string | null;
  venue?: VenuePeriodData;
  venues?: VenuePeriodData[];
  totals?: {
    current: PeriodAggregation;
    prior: PeriodAggregation;
    secondary_prior: PeriodAggregation | null;
    labor_current: PeriodLaborAggregation | null;
    labor_prior: PeriodLaborAggregation | null;
    variance: VarianceSet;
    secondary_variance: VarianceSet | null;
    comp_by_reason?: CompByReason[];
  };
  fiscal?: {
    calendar_type: string;
    fiscal_year: number;
    fiscal_period: number;
    period_start_date: string;
    period_end_date: string;
  };
  ptd_weeks?: PtdWeekRow[];
  ytd_periods?: YtdPeriodRow[];
}

const VIEW_LABELS: Record<PulseViewMode, string> = {
  today: 'Today',
  wtd: 'Week to Date',
  ptd: 'Period to Date',
  ytd: 'Year to Date',
};

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
  const d = new Date(isoString);
  // Round to nearest hour
  if (d.getMinutes() >= 30) {
    d.setHours(d.getHours() + 1);
  }
  d.setMinutes(0, 0, 0);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    hour12: true,
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function formatDateRange(startStr: string, endStr: string): string {
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(endStr + 'T12:00:00');
  const startFmt = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endFmt = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startFmt} – ${endFmt}`;
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

function DateSelector({
  selectedDate,
  onDateChange,
  onToday,
}: {
  selectedDate: string | null;
  onDateChange: (date: string) => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => selectedDate && onDateChange(shiftDate(selectedDate, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="flex items-center gap-1.5">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={selectedDate || ''}
          onChange={(e) => onDateChange(e.target.value)}
          className="bg-transparent border-none text-sm font-medium w-[130px] cursor-pointer focus:outline-none"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => selectedDate && onDateChange(shiftDate(selectedDate, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onToday}>
        Today
      </Button>
    </div>
  );
}

function PaceBadge({ status }: { status: string }) {
  const config = STATUS_COLORS[status] || STATUS_COLORS.no_target;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      <Activity className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function ComparisonLine({ label, value, current, fmt }: { label: string; value: number; current: number; fmt: (v: number) => string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{fmt(value)}</span>
      {current > 0 && (
        current >= value ? (
          <TrendingUp className="h-3 w-3 text-emerald-500" />
        ) : (
          <TrendingDown className="h-3 w-3 text-red-500" />
        )
      )}
    </div>
  );
}

function GaugeCard({
  title,
  icon: Icon,
  current,
  target,
  pct,
  status,
  sdlw,
  sdly,
  format = 'currency',
  targetSource = 'forecast',
}: {
  title: string;
  icon: any;
  current: number;
  target: number;
  pct: number | null;
  status: string;
  sdlw: number | null;
  sdly: number | null;
  format?: 'currency' | 'number';
  targetSource?: 'forecast' | 'sdlw' | 'none';
}) {
  const fmt = format === 'currency' ? formatCurrency : formatNumber;
  const config = STATUS_COLORS[status] || STATUS_COLORS.no_target;
  const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const targetLabel = targetSource === 'forecast' ? 'forecast' : 'SDLW';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${config.text}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{fmt(current)}</div>

        {target > 0 && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{pct != null ? `${pct}% of ${targetLabel}` : '—'}</span>
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

        <div className="mt-1 space-y-0.5">
          {sdlw != null && sdlw > 0 && (
            <ComparisonLine label="SDLW" value={sdlw} current={current} fmt={fmt} />
          )}
          {sdly != null && sdly > 0 && (
            <ComparisonLine label="SDLY" value={sdly} current={current} fmt={fmt} />
          )}
        </div>
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

  // Sorted newest-first; delta = difference from the previous (older) snapshot
  const sorted = [...snapshots].reverse();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Time</th>
            <th className="pb-2 pr-4 font-medium text-right">Net Sales</th>
            <th className="pb-2 pr-4 font-medium text-right">$ Change</th>
            <th className="pb-2 pr-4 font-medium text-right">Covers</th>
            <th className="pb-2 pr-4 font-medium text-right">Checks</th>
            <th className="pb-2 pr-4 font-medium text-right">Avg Check</th>
            <th className="pb-2 pr-4 font-medium text-right">Bev %</th>
            <th className="pb-2 font-medium text-right">Comps</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            // Next item in sorted (newest-first) is the previous snapshot chronologically
            const prev = i < sorted.length - 1 ? sorted[i + 1] : null;
            const delta = prev != null ? s.net_sales - prev.net_sales : null;

            return (
              <tr key={s.id} className="border-b border-border/50 hover:bg-muted/50">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {formatTime(s.snapshot_at)}
                  </div>
                </td>
                <td className="py-2 pr-4 text-right font-medium">{formatCurrency(s.net_sales)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {delta != null ? (
                    <span className={delta > 0 ? 'text-emerald-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground'}>
                      {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ServiceChart({
  snapshots,
  forecastRevenue,
  sdlwRevenue,
}: {
  snapshots: SalesSnapshot[];
  forecastRevenue: number | null;
  sdlwRevenue: number | null;
}) {
  if (snapshots.length === 0) return null;

  const hasLabor = snapshots.some((s) => s.labor_cost > 0);

  const chartData = snapshots.map((s) => ({
    time: new Date(s.snapshot_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    revenue: s.net_sales,
    labor: hasLabor ? s.labor_cost : undefined,
  }));

  const revenueMax = Math.max(
    ...snapshots.map((s) => s.net_sales),
    forecastRevenue || 0,
    sdlwRevenue || 0,
  );

  const tickFormatter = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="revenue"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            width={50}
            domain={[0, Math.ceil(revenueMax * 1.15)]}
          />
          {hasLabor && (
            <YAxis
              yAxisId="labor"
              orientation="right"
              tickFormatter={tickFormatter}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={50}
              domain={[0, Math.ceil(revenueMax * 1.15)]}
            />
          )}
          <RechartsTooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              fontSize: '12px',
            }}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'revenue' ? 'Revenue' : 'Labor',
            ]}
            labelStyle={{ fontWeight: 600 }}
          />
          {forecastRevenue != null && forecastRevenue > 0 && (
            <ReferenceLine
              yAxisId="revenue"
              y={forecastRevenue}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="6 3"
              label={{
                value: `Forecast ${formatCurrency(forecastRevenue)}`,
                position: 'insideTopRight',
                fontSize: 10,
                fill: 'hsl(var(--muted-foreground))',
              }}
            />
          )}
          {sdlwRevenue != null && sdlwRevenue > 0 && (
            <ReferenceLine
              yAxisId="revenue"
              y={sdlwRevenue}
              stroke="#8b5cf6"
              strokeDasharray="4 4"
              label={{
                value: `SDLW ${formatCurrency(sdlwRevenue)}`,
                position: 'insideBottomRight',
                fontSize: 10,
                fill: '#8b5cf6',
              }}
            />
          )}
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            stroke="#10b981"
            strokeWidth={2.5}
            fill="#10b981"
            fillOpacity={0.08}
            dot={false}
            activeDot={{ r: 4, fill: '#10b981' }}
          />
          {hasLabor && (
            <Line
              yAxisId="labor"
              type="monotone"
              dataKey="labor"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="4 2"
              dot={false}
              activeDot={{ r: 3, fill: '#f59e0b' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 bg-emerald-500 rounded" />
          <span>Revenue</span>
        </div>
        {hasLabor && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-amber-500" />
            <span>Labor</span>
          </div>
        )}
        {forecastRevenue != null && forecastRevenue > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-muted-foreground" />
            <span>Forecast EOD</span>
          </div>
        )}
        {sdlwRevenue != null && sdlwRevenue > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 border-t-2 border-dashed border-purple-500" />
            <span>SDLW EOD</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// GROUP-WIDE VIEW
// ══════════════════════════════════════════════════════════════════════════

function GroupSummary({ data, enrichment, enrichmentLoading }: {
  data: GroupData;
  enrichment: GroupEnrichmentData | null;
  enrichmentLoading: boolean;
}) {
  const { totals, venues } = data;
  const bevPct = (totals.food_sales + totals.beverage_sales) > 0
    ? (totals.beverage_sales / (totals.food_sales + totals.beverage_sales)) * 100
    : 0;

  const et = enrichment?.totals;
  // Build venue enrichment lookup
  const venueEnrichMap = new Map<string, EnrichmentData>();
  enrichment?.venues?.forEach(v => venueEnrichMap.set(v.venue_id, v));

  function laborPctColor(_pct: number) {
    return '';
  }

  function compPctColor(_pct: number) {
    return '';
  }

  return (
    <div className="space-y-6">
      {/* Group totals — row 1: Sales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Group Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.net_sales)}</div>
            {totals.sdlw_net > 0 && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">SDLW:</span>
                <span className="font-medium">{formatCurrency(totals.sdlw_net)}</span>
                {totals.net_sales >= totals.sdlw_net ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Group Covers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totals.covers)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(totals.checks)} checks
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Labor</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {enrichmentLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse" />
            ) : et ? (
              <>
                <div className={`text-2xl font-bold ${laborPctColor(et.labor_pct)}`}>
                  {et.labor_pct > 0 ? `${et.labor_pct.toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(et.labor_cost)} &middot; {et.total_hours.toFixed(0)}h &middot; {et.employee_count} staff
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comps</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {enrichmentLoading ? (
              <div className="h-8 bg-muted rounded animate-pulse" />
            ) : et ? (
              <>
                <div className={`text-2xl font-bold ${compPctColor(et.comp_pct)}`}>
                  {et.comp_pct > 0 ? `${et.comp_pct.toFixed(1)}%` : '0%'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(et.comp_total)}
                  {et.critical_count > 0 && (
                    <span className="ml-2">{et.critical_count} critical</span>
                  )}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-venue table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Venue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Venue</th>
                  <th className="pb-2 pr-4 font-medium text-right">Net Sales</th>
                  <th className="pb-2 pr-4 font-medium text-right">Covers</th>
                  <th className="pb-2 pr-4 font-medium text-right">Avg Check</th>
                  <th className="pb-2 pr-4 font-medium text-right">Labor %</th>
                  <th className="pb-2 pr-4 font-medium text-right">Comps</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {venues
                  .sort((a, b) => (b.current?.net_sales ?? 0) - (a.current?.net_sales ?? 0))
                  .map((v) => {
                    const net = v.current?.net_sales ?? 0;
                    const covers = v.current?.covers_count ?? 0;
                    const checks = v.current?.checks_count ?? 0;
                    const ve = venueEnrichMap.get(v.venue_id);
                    return (
                      <tr key={v.venue_id} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-2.5 pr-4 font-medium">{v.venue_name}</td>
                        <td className="py-2.5 pr-4 text-right font-medium">{formatCurrency(net)}</td>
                        <td className="py-2.5 pr-4 text-right">{formatNumber(covers)}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {checks > 0 ? formatCurrency(net / checks) : '—'}
                        </td>
                        <td className={`py-2.5 pr-4 text-right ${ve?.labor ? laborPctColor(ve.labor.labor_pct) : ''}`}>
                          {ve?.labor ? `${ve.labor.labor_pct.toFixed(1)}%` : '—'}
                        </td>
                        <td className={`py-2.5 pr-4 text-right ${ve?.comps ? compPctColor(ve.comps.pct) : ''}`}>
                          {ve?.comps ? `${formatCurrency(ve.comps.total)} (${ve.comps.pct.toFixed(1)}%)` : '—'}
                        </td>
                        <td className="py-2.5 text-center">
                          <PaceBadge status={v.pace.status} />
                        </td>
                      </tr>
                    );
                  })}
                {/* Totals row */}
                <tr className="border-t-2 font-semibold">
                  <td className="py-2.5 pr-4">Total</td>
                  <td className="py-2.5 pr-4 text-right">{formatCurrency(totals.net_sales)}</td>
                  <td className="py-2.5 pr-4 text-right">{formatNumber(totals.covers)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    {totals.checks > 0 ? formatCurrency(totals.net_sales / totals.checks) : '—'}
                  </td>
                  <td className={`py-2.5 pr-4 text-right ${et ? laborPctColor(et.labor_pct) : ''}`}>
                    {et ? `${et.labor_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`py-2.5 pr-4 text-right ${et ? compPctColor(et.comp_pct) : ''}`}>
                    {et ? `${formatCurrency(et.comp_total)} (${et.comp_pct.toFixed(1)}%)` : '—'}
                  </td>
                  <td className="py-2.5" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PERIOD GROUP VIEW
// ══════════════════════════════════════════════════════════════════════════

function PeriodGroupSummary({ data }: { data: PeriodResponse }) {
  const { totals, venues = [] } = data;
  if (!totals) return null;

  const { current, prior, labor_current, variance } = totals;

  // Merge days across all venues for WTD daily chart
  const mergedDays: PeriodDayRow[] = (() => {
    const dayMap = new Map<string, PeriodDayRow>();
    for (const v of venues) {
      for (const d of v.days) {
        const existing = dayMap.get(d.business_date);
        if (existing) {
          existing.net_sales += d.net_sales;
          existing.covers_count += d.covers_count;
          existing.prior_net_sales = (existing.prior_net_sales || 0) + (d.prior_net_sales || 0);
          existing.prior_covers = (existing.prior_covers || 0) + (d.prior_covers || 0);
        } else {
          dayMap.set(d.business_date, { ...d });
        }
      }
    }
    return Array.from(dayMap.values()).sort((a, b) => a.business_date.localeCompare(b.business_date));
  })();

  return (
    <div className="space-y-6">
      {/* Period date range banner */}
      <div className="text-sm text-muted-foreground">
        {VIEW_LABELS[data.view]}: {formatDateRange(data.period_start, data.period_end)}
        <span className="ml-2 text-xs">({data.prior_label || 'vs prior'}: {formatDateRange(data.prior_start, data.prior_end)})</span>
        {data.secondary_prior_start && data.secondary_prior_end && (
          <span className="ml-2 text-xs">({data.secondary_prior_label}: {formatDateRange(data.secondary_prior_start, data.secondary_prior_end)})</span>
        )}
      </div>

      {/* Group totals */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PeriodGaugeCard
          title="Group Revenue"
          icon={DollarSign}
          current={current.net_sales}
          prior={prior.net_sales}
          variancePct={variance.net_sales_pct}
          priorLabel={data.prior_label || 'vs prior'}
          secondaryPrior={totals.secondary_prior?.net_sales}
          secondaryVariancePct={totals.secondary_variance?.net_sales_pct}
          secondaryLabel={data.secondary_prior_label}
          daysCount={current.days_count}
        />
        <PeriodGaugeCard
          title="Group Covers"
          icon={Users}
          current={current.covers_count}
          prior={prior.covers_count}
          variancePct={variance.covers_pct}
          priorLabel={data.prior_label || 'vs prior'}
          secondaryPrior={totals.secondary_prior?.covers_count}
          secondaryVariancePct={totals.secondary_variance?.covers_pct}
          secondaryLabel={data.secondary_prior_label}
          format="number"
        />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Labor</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {labor_current ? (
              <>
                <div className="text-2xl font-bold">
                  {labor_current.labor_pct > 0 ? `${labor_current.labor_pct.toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(labor_current.labor_cost)} &middot; {labor_current.total_hours.toFixed(0)}h
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No labor data</div>
            )}
          </CardContent>
        </Card>
        <CompCard
          comps={current.net_sales > 0 ? {
            total: current.comps_total,
            pct: (current.comps_total / current.net_sales) * 100,
            net_sales: current.net_sales,
            exception_count: 0,
            critical_count: 0,
            warning_count: 0,
            top_exceptions: [],
            by_reason: totals.comp_by_reason,
          } : null}
        />
      </div>

      {/* Per-venue table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Venue Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Venue</th>
                  <th className="pb-2 pr-4 font-medium text-right">Net Sales</th>
                  <th className="pb-2 pr-4 font-medium text-right">Covers</th>
                  <th className="pb-2 pr-4 font-medium text-right">Avg Check</th>
                  <th className="pb-2 pr-4 font-medium text-right">Labor %</th>
                  <th className="pb-2 pr-4 font-medium text-right">Comps %</th>
                  <th className="pb-2 pr-4 font-medium text-right">{data.prior_label || 'Var %'}</th>
                  {data.secondary_prior_label && (
                    <th className="pb-2 font-medium text-right">{data.secondary_prior_label}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {[...venues]
                  .sort((a, b) => b.current.net_sales - a.current.net_sales)
                  .map((v) => {
                    const compPct = v.current.net_sales > 0 ? (v.current.comps_total / v.current.net_sales) * 100 : 0;
                    return (
                      <tr key={v.venue_id} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-2.5 pr-4 font-medium">{v.venue_name}</td>
                        <td className="py-2.5 pr-4 text-right font-medium">{formatCurrency(v.current.net_sales)}</td>
                        <td className="py-2.5 pr-4 text-right">{formatNumber(v.current.covers_count)}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {v.current.avg_check > 0 ? formatCurrency(v.current.avg_check) : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {v.labor_current ? `${v.labor_current.labor_pct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {compPct > 0 ? `${compPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {v.variance.net_sales_pct != null ? (
                            <span className="inline-flex items-center gap-0.5">
                              {v.variance.net_sales_pct >= 0 ? (
                                <TrendingUp className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <TrendingDown className="h-3 w-3 text-red-500" />
                              )}
                              <span className={v.variance.net_sales_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                {v.variance.net_sales_pct > 0 ? '+' : ''}{v.variance.net_sales_pct.toFixed(1)}%
                              </span>
                            </span>
                          ) : '—'}
                        </td>
                        {data.secondary_prior_label && (
                          <td className="py-2.5 text-right">
                            {v.secondary_variance?.net_sales_pct != null ? (
                              <span className="inline-flex items-center gap-0.5">
                                {v.secondary_variance.net_sales_pct >= 0 ? (
                                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                                ) : (
                                  <TrendingDown className="h-3 w-3 text-red-500" />
                                )}
                                <span className={v.secondary_variance.net_sales_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                  {v.secondary_variance.net_sales_pct > 0 ? '+' : ''}{v.secondary_variance.net_sales_pct.toFixed(1)}%
                                </span>
                              </span>
                            ) : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                {/* Totals row */}
                <tr className="border-t-2 font-semibold">
                  <td className="py-2.5 pr-4">Total</td>
                  <td className="py-2.5 pr-4 text-right">{formatCurrency(current.net_sales)}</td>
                  <td className="py-2.5 pr-4 text-right">{formatNumber(current.covers_count)}</td>
                  <td className="py-2.5 pr-4 text-right">
                    {current.avg_check > 0 ? formatCurrency(current.avg_check) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    {labor_current ? `${labor_current.labor_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    {current.net_sales > 0 ? `${((current.comps_total / current.net_sales) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right">
                    {variance.net_sales_pct != null ? (
                      <span className={variance.net_sales_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                        {variance.net_sales_pct > 0 ? '+' : ''}{variance.net_sales_pct.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  {data.secondary_prior_label && (
                    <td className="py-2.5 text-right">
                      {totals.secondary_variance?.net_sales_pct != null ? (
                        <span className={totals.secondary_variance.net_sales_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                          {totals.secondary_variance.net_sales_pct > 0 ? '+' : ''}{totals.secondary_variance.net_sales_pct.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* WTD: daily chart + table (merged across venues) */}
      {data.view === 'wtd' && mergedDays.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Revenue vs Prior</CardTitle>
            </CardHeader>
            <CardContent>
              <PeriodDayChart days={mergedDays} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Daily Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <PeriodDayTable days={mergedDays} />
            </CardContent>
          </Card>
        </>
      )}

      {/* PTD: week breakdown */}
      {data.view === 'ptd' && data.ptd_weeks && data.ptd_weeks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Weekly Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <PeriodWeekBreakdown weeks={data.ptd_weeks} />
          </CardContent>
        </Card>
      )}

      {/* YTD: period breakdown */}
      {data.view === 'ytd' && data.ytd_periods && data.ytd_periods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Period Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <YtdPeriodBreakdown periods={data.ytd_periods} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════

const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export default function LivePulsePage() {
  const { selectedVenue, isAllVenues } = useVenue();
  const searchParams = useSearchParams();
  const router = useRouter();

  // View mode: today (live) or period aggregation
  const [viewMode, setViewMode] = useState<PulseViewMode>(
    (['today', 'wtd', 'ptd', 'ytd'].includes(searchParams.get('view') || '')
      ? searchParams.get('view') as PulseViewMode
      : 'today')
  );

  // Today (daily) view state
  const [data, setData] = useState<PaceData | null>(null);
  const [groupData, setGroupData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [checksSheetOpen, setChecksSheetOpen] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [checkDetailOpen, setCheckDetailOpen] = useState(false);
  const [enrichment, setEnrichment] = useState<EnrichmentData | null>(null);
  const [groupEnrichment, setGroupEnrichment] = useState<GroupEnrichmentData | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);

  // Period view state
  const [periodData, setPeriodData] = useState<PeriodResponse | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  const handleViewChange = (newView: string) => {
    const v = newView as PulseViewMode;
    setViewMode(v);
    const params = new URLSearchParams(searchParams.toString());
    if (v === 'today') {
      params.delete('view');
    } else {
      params.set('view', v);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

  // Fetch daily pace data (only in "today" mode)
  const fetchData = useCallback(async () => {
    if (!selectedVenue && !isAllVenues) return;
    if (viewMode !== 'today') return;

    setLoading(true);
    setError(null);

    try {
      const venueParam = isAllVenues ? 'all' : selectedVenue!.id;
      const dateParam = selectedDate ? `&date=${selectedDate}` : '';
      const res = await fetch(`/api/sales/pace?venue_id=${venueParam}${dateParam}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();

      if (isAllVenues) {
        setGroupData(json);
        setData(null);
      } else {
        setData(json);
        setGroupData(null);
      }
      // Always sync date from server response
      if (!selectedDate && json.date) {
        setSelectedDate(json.date);
      }
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedVenue, isAllVenues, selectedDate, viewMode]);

  // Fetch labor + comp enrichment (only in "today" mode)
  const fetchEnrichment = useCallback(async () => {
    if (!selectedVenue && !isAllVenues) return;
    if (viewMode !== 'today') return;
    setEnrichmentLoading(true);
    try {
      const venueParam = isAllVenues ? 'all' : selectedVenue!.id;
      const dateParam = selectedDate ? `&date=${selectedDate}` : `&date=${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch(`/api/pulse/enrichment?venue_id=${venueParam}${dateParam}`);
      if (!res.ok) return;
      const json = await res.json();
      if (isAllVenues) {
        setGroupEnrichment(json);
        setEnrichment(null);
      } else {
        setEnrichment(json);
        setGroupEnrichment(null);
      }
    } catch {
      // Non-critical — labor/comp cards just won't show
    } finally {
      setEnrichmentLoading(false);
    }
  }, [selectedVenue, isAllVenues, selectedDate, viewMode]);

  // Fetch period aggregation data (WTD/PTD/YTD)
  const fetchPeriodData = useCallback(async () => {
    if (!selectedVenue && !isAllVenues) return;
    if (viewMode === 'today') return;

    setPeriodLoading(true);
    setError(null);

    try {
      const venueParam = isAllVenues ? 'all' : selectedVenue!.id;
      const dateParam = selectedDate || new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/pulse/periods?view=${viewMode}&venue_id=${venueParam}&date=${dateParam}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setPeriodData(json);
      if (!selectedDate && json.date) {
        setSelectedDate(json.date);
      }
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPeriodLoading(false);
    }
  }, [selectedVenue, isAllVenues, selectedDate, viewMode]);

  // Fetch on mount, venue change, date change, or view mode change
  useEffect(() => {
    if (viewMode === 'today') {
      fetchData();
      fetchEnrichment();
    } else {
      fetchPeriodData();
    }
  }, [fetchData, fetchEnrichment, fetchPeriodData, viewMode]);

  // Auto-refresh every 5 minutes (only in "today" mode)
  useEffect(() => {
    if (viewMode !== 'today') return;
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData, viewMode]);

  // Supabase Realtime: instant refresh when new snapshots are written
  const supabaseRef = useRef(createClient());
  useEffect(() => {
    const venueFilter = isAllVenues
      ? undefined
      : selectedVenue?.id;

    const channel = supabaseRef.current
      .channel('pulse-snapshots')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sales_snapshots',
          ...(venueFilter ? { filter: `venue_id=eq.${venueFilter}` } : {}),
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabaseRef.current.removeChannel(channel);
    };
  }, [selectedVenue, isAllVenues, fetchData]);

  const handleToday = () => {
    setSelectedDate(null); // null = let server compute today
    // fetchData will be triggered by the state change
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Pulse</h1>
          <p className="text-muted-foreground text-sm">
            {isAllVenues ? 'Group-wide sales overview' : 'Real-time sales pace vs. forecast'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            onToday={handleToday}
          />
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Updated {formatTime(lastRefreshed.toISOString())}
            </span>
          )}
          {selectedVenue && !isAllVenues && viewMode === 'today' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChecksSheetOpen(true)}
            >
              <Receipt className="h-4 w-4 mr-1.5" />
              Checks
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={viewMode === 'today' ? fetchData : fetchPeriodData}
            disabled={loading || periodLoading}
          >
            {(loading || periodLoading) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <VenueQuickSwitcher />
        </div>
      </div>

      {/* View mode tabs */}
      <Tabs value={viewMode} onValueChange={handleViewChange}>
        <TabsList className="grid grid-cols-4 w-full max-w-sm">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="wtd">WTD</TabsTrigger>
          <TabsTrigger value="ptd">PTD</TabsTrigger>
          <TabsTrigger value="ytd">YTD</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* No venue selected */}
      {!selectedVenue && !isAllVenues && (
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
      {((loading || periodLoading) && !data && !groupData && !periodData && (selectedVenue || isAllVenues)) && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ═══ PERIOD VIEWS (WTD / PTD / YTD) ═══ */}
      {viewMode !== 'today' && periodData && (
        <>
          {/* Group period view */}
          {isAllVenues && periodData.venues && (
            <PeriodGroupSummary data={periodData} />
          )}

          {/* Single venue period view */}
          {!isAllVenues && periodData.venue && (
            <>
              {/* Period date range banner */}
              <div className="text-sm text-muted-foreground">
                {VIEW_LABELS[viewMode]}: {formatDateRange(periodData.period_start, periodData.period_end)}
                <span className="ml-2 text-xs">({periodData.prior_label || 'vs prior'}: {formatDateRange(periodData.prior_start, periodData.prior_end)})</span>
                {periodData.secondary_prior_start && periodData.secondary_prior_end && (
                  <span className="ml-2 text-xs">({periodData.secondary_prior_label}: {formatDateRange(periodData.secondary_prior_start, periodData.secondary_prior_end)})</span>
                )}
              </div>

              {/* Period gauge cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <PeriodGaugeCard
                  title="Net Revenue"
                  icon={DollarSign}
                  current={periodData.venue.current.net_sales}
                  prior={periodData.venue.prior.net_sales}
                  variancePct={periodData.venue.variance.net_sales_pct}
                  priorLabel={periodData.prior_label || 'vs prior'}
                  secondaryPrior={periodData.venue.secondary_prior?.net_sales}
                  secondaryVariancePct={periodData.venue.secondary_variance?.net_sales_pct}
                  secondaryLabel={periodData.secondary_prior_label}
                  daysCount={periodData.venue.current.days_count}
                />
                <PeriodGaugeCard
                  title="Covers"
                  icon={Users}
                  current={periodData.venue.current.covers_count}
                  prior={periodData.venue.prior.covers_count}
                  variancePct={periodData.venue.variance.covers_pct}
                  priorLabel={periodData.prior_label || 'vs prior'}
                  secondaryPrior={periodData.venue.secondary_prior?.covers_count}
                  secondaryVariancePct={periodData.venue.secondary_variance?.covers_pct}
                  secondaryLabel={periodData.secondary_prior_label}
                  format="number"
                />
                <PeriodGaugeCard
                  title="Avg Check"
                  icon={TrendingUp}
                  current={periodData.venue.current.avg_check}
                  prior={periodData.venue.prior.avg_check}
                  variancePct={periodData.venue.variance.avg_check_pct}
                  priorLabel={periodData.prior_label || 'vs prior'}
                  secondaryPrior={periodData.venue.secondary_prior?.avg_check}
                  secondaryVariancePct={periodData.venue.secondary_variance?.avg_check_pct}
                  secondaryLabel={periodData.secondary_prior_label}
                />
                <PeriodCategoryMixCard
                  foodSales={periodData.venue.current.food_sales}
                  bevSales={periodData.venue.current.beverage_sales}
                  priorBevPct={periodData.venue.prior.beverage_pct}
                />
              </div>

              {/* Labor + Comps for period */}
              <div className="grid gap-4 md:grid-cols-2">
                <LaborCard
                  labor={periodData.venue.labor_current ? {
                    total_hours: periodData.venue.labor_current.total_hours,
                    labor_cost: periodData.venue.labor_current.labor_cost,
                    labor_pct: periodData.venue.labor_current.labor_pct,
                    splh: periodData.venue.labor_current.splh,
                    ot_hours: periodData.venue.labor_current.ot_hours,
                    covers_per_labor_hour: periodData.venue.labor_current.total_hours > 0
                      ? periodData.venue.current.covers_count / periodData.venue.labor_current.total_hours
                      : null,
                    employee_count: periodData.venue.labor_current.employee_count,
                    punch_count: 0,
                    foh: periodData.venue.labor_current.foh_cost > 0 ? { hours: 0, cost: periodData.venue.labor_current.foh_cost, employee_count: 0 } : null,
                    boh: periodData.venue.labor_current.boh_cost > 0 ? { hours: 0, cost: periodData.venue.labor_current.boh_cost, employee_count: 0 } : null,
                    other: null,
                  } : null}
                  netSales={periodData.venue.current.net_sales + periodData.venue.current.comps_total}
                />
                <CompCard
                  comps={periodData.venue.current.net_sales > 0 ? {
                    total: periodData.venue.current.comps_total,
                    pct: (periodData.venue.current.comps_total / periodData.venue.current.net_sales) * 100,
                    net_sales: periodData.venue.current.net_sales,
                    exception_count: 0,
                    critical_count: 0,
                    warning_count: 0,
                    top_exceptions: [],
                    by_reason: periodData.venue.comp_by_reason,
                  } : null}
                />
              </div>

              {/* WTD: daily chart + table */}
              {viewMode === 'wtd' && (
                <>
                  {periodData.venue.days.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium">Daily Revenue vs Prior</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <PeriodDayChart days={periodData.venue.days} />
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Daily Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <PeriodDayTable days={periodData.venue.days} />
                    </CardContent>
                  </Card>
                </>
              )}

              {/* PTD: week breakdown */}
              {viewMode === 'ptd' && periodData.ptd_weeks && periodData.ptd_weeks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Weekly Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PeriodWeekBreakdown weeks={periodData.ptd_weeks} />
                  </CardContent>
                </Card>
              )}

              {/* YTD: period breakdown */}
              {viewMode === 'ytd' && periodData.ytd_periods && periodData.ytd_periods.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Period Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <YtdPeriodBreakdown periods={periodData.ytd_periods} />
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* ═══ TODAY (DAILY) VIEW ═══ */}

      {/* Group-wide view */}
      {viewMode === 'today' && isAllVenues && groupData && (
        <GroupSummary data={groupData} enrichment={groupEnrichment} enrichmentLoading={enrichmentLoading} />
      )}

      {/* Single venue view */}
      {viewMode === 'today' && data && selectedVenue && !isAllVenues && (
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
              pct={data.pace.revenue_pct}
              status={data.pace.revenue_status}
              sdlw={data.sdlw?.net_sales ?? null}
              sdly={data.sdly?.net_sales ?? null}
              targetSource={data.pace.target_source}
            />
            <GaugeCard
              title="Covers"
              icon={Users}
              current={data.current?.covers_count ?? 0}
              target={data.pace.covers_target}
              pct={data.pace.covers_pct}
              status={data.pace.covers_status}
              sdlw={data.sdlw?.covers_count ?? null}
              sdly={data.sdly?.covers_count ?? null}
              targetSource={data.pace.target_source}
              format="number"
            />
            <GaugeCard
              title="Avg Check"
              icon={TrendingUp}
              current={data.current?.avg_check ?? 0}
              target={0}
              pct={null}
              status="no_target"
              sdlw={data.sdlw ? data.sdlw.gross_sales / Math.max(data.sdlw.checks_count, 1) : null}
              sdly={data.sdly ? data.sdly.gross_sales / Math.max(data.sdly.checks_count, 1) : null}
            />
            <CategoryMixCard
              foodSales={data.current?.food_sales ?? 0}
              bevSales={data.current?.beverage_sales ?? 0}
              sdlwFood={data.sdlw?.food_sales ?? null}
              sdlwBev={data.sdlw?.beverage_sales ?? null}
            />
          </div>

          {/* Labor + Comps */}
          <div className="grid gap-4 md:grid-cols-2">
            <LaborCard labor={enrichment?.labor ?? null} loading={enrichmentLoading} netSales={(data.current?.net_sales ?? 0) + (data.current?.comps_total ?? 0)} />
            <CompCard comps={enrichment?.comps ?? null} loading={enrichmentLoading} />
          </div>

          {/* Service chart */}
          {data.snapshots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Revenue Over Service</CardTitle>
              </CardHeader>
              <CardContent>
                <ServiceChart
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

      {/* Check drill-down */}
      {selectedVenue && !isAllVenues && (
        <>
          <CheckListSheet
            isOpen={checksSheetOpen}
            onClose={() => setChecksSheetOpen(false)}
            venueId={selectedVenue.id}
            venueName={selectedVenue.name}
            date={selectedDate || new Date().toISOString().slice(0, 10)}
            onSelectCheck={(id) => {
              setSelectedCheckId(id);
              setCheckDetailOpen(true);
            }}
          />
          <CheckDetailDialog
            checkId={selectedCheckId}
            isOpen={checkDetailOpen}
            onClose={() => {
              setCheckDetailOpen(false);
              setSelectedCheckId(null);
            }}
          />
        </>
      )}
    </div>
  );
}
