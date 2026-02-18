'use client';

import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Target } from 'lucide-react';

interface Props {
  netSales: number;
  totalCovers: number;
  totalComps: number;
  forecast?: { net_sales: number | null; covers: number | null } | null;
  variance?: {
    vs_forecast_pct: number | null;
    vs_sdlw_pct: number | null;
    vs_sdly_pct: number | null;
  } | null;
  foodSales?: number;
  beverageSales?: number;
  beveragePct?: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

function VBadge({ value, label }: { value: number | null | undefined; label: string }) {
  if (value == null) return null;
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={pos ? 'text-emerald-500 font-medium' : 'text-red-500 font-medium'}>
        {pos ? '+' : ''}{value.toFixed(1)}%
      </span>
      {pos ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
    </div>
  );
}

export function RevenueContextCard({
  netSales,
  totalCovers,
  totalComps,
  forecast,
  variance,
  foodSales,
  beverageSales,
  beveragePct,
}: Props) {
  const avgCheck = totalCovers > 0 ? netSales / totalCovers : 0;
  const compPct = netSales > 0 ? (totalComps / netSales) * 100 : 0;

  return (
    <Card className="bg-muted/30 border-brass/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-brass" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Revenue Summary
          </span>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(netSales)}</div>
            <div className="text-xs text-muted-foreground">Net Sales</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{totalCovers.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Covers</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(avgCheck)}</div>
            <div className="text-xs text-muted-foreground">Avg Check</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">
              {beveragePct != null ? `${beveragePct.toFixed(0)}%` : '—'}
            </div>
            <div className="text-xs text-muted-foreground">Bev Mix</div>
          </div>
        </div>

        {/* Forecast + Variance */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {forecast?.net_sales != null && (
            <div className="text-xs text-muted-foreground">
              Forecast: <span className="font-medium text-foreground">{fmt(forecast.net_sales)}</span>
            </div>
          )}
          <VBadge value={variance?.vs_forecast_pct} label="vs Fcst" />
          <VBadge value={variance?.vs_sdlw_pct} label="vs SDLW" />
          <VBadge value={variance?.vs_sdly_pct} label="vs SDLY" />
        </div>

        {/* Comp summary line */}
        {totalComps > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            Comps: <span className="font-medium text-foreground">{fmt(totalComps)}</span>
            <span className="ml-1">({compPct.toFixed(1)}% of net)</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
