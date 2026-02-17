'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';

const fmtCurrency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtNumber = (n: number) => n.toLocaleString('en-US');

export function PeriodGaugeCard({
  title,
  icon: Icon,
  current,
  prior,
  variancePct,
  priorLabel = 'vs prior',
  secondaryPrior,
  secondaryVariancePct,
  secondaryLabel,
  format = 'currency',
  daysCount,
}: {
  title: string;
  icon: any;
  current: number;
  prior: number;
  variancePct: number | null;
  priorLabel?: string;
  secondaryPrior?: number | null;
  secondaryVariancePct?: number | null;
  secondaryLabel?: string | null;
  format?: 'currency' | 'number';
  daysCount?: number;
}) {
  const fmt = format === 'currency' ? fmtCurrency : fmtNumber;

  const VarianceBadge = ({ pct, label }: { pct: number; label: string }) => (
    <div className="flex items-center gap-1 text-xs">
      {pct >= 0 ? (
        <TrendingUp className="h-3 w-3 text-emerald-500" />
      ) : (
        <TrendingDown className="h-3 w-3 text-red-500" />
      )}
      <span className={pct >= 0 ? 'text-emerald-500' : 'text-red-500'}>
        {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{fmt(current)}</div>

        {/* Variance badges */}
        <div className="mt-1 space-y-0.5">
          {variancePct != null ? (
            <VarianceBadge pct={variancePct} label={priorLabel} />
          ) : (
            prior === 0 && (
              <div className="text-xs text-muted-foreground">No prior data</div>
            )
          )}
          {secondaryVariancePct != null && secondaryLabel && (
            <VarianceBadge pct={secondaryVariancePct} label={secondaryLabel} />
          )}
        </div>

        {/* Prior values */}
        <div className="mt-1 space-y-0.5">
          {prior > 0 && (
            <div className="text-xs text-muted-foreground">
              {priorLabel.replace('vs ', '')}: <span className="font-medium">{fmt(prior)}</span>
            </div>
          )}
          {secondaryPrior != null && secondaryPrior > 0 && secondaryLabel && (
            <div className="text-xs text-muted-foreground">
              {secondaryLabel.replace('vs ', '')}: <span className="font-medium">{fmt(secondaryPrior)}</span>
            </div>
          )}
        </div>

        {/* Days count */}
        {daysCount != null && daysCount > 0 && (
          <div className="mt-1 text-xs text-muted-foreground">
            {daysCount} day{daysCount !== 1 ? 's' : ''}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PeriodCategoryMixCard({
  foodSales,
  bevSales,
  priorBevPct,
}: {
  foodSales: number;
  bevSales: number;
  priorBevPct: number | null;
}) {
  const total = foodSales + bevSales;
  const foodPct = total > 0 ? (foodSales / total) * 100 : 0;
  const bevPct = total > 0 ? (bevSales / total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Category Mix</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Food</span>
            <div className="text-right">
              <span className="font-medium">{fmtCurrency(foodSales)}</span>
              <span className="text-muted-foreground ml-1">({foodPct.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Beverage</span>
            <div className="text-right">
              <span className="font-medium">{fmtCurrency(bevSales)}</span>
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

        {priorBevPct != null && (
          <div className="text-xs text-muted-foreground">
            Prior bev mix: {priorBevPct.toFixed(0)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}
