'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Clock, AlertTriangle } from 'lucide-react';

interface LaborData {
  total_hours: number;
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  covers_per_labor_hour: number | null;
  employee_count: number;
  foh: { hours: number; cost: number; employee_count: number } | null;
  boh: { hours: number; cost: number; employee_count: number } | null;
  other: { hours: number; cost: number; employee_count: number } | null;
}

interface Props {
  labor: LaborData | null;
  netSales: number;
  covers: number;
  laborExceptions?: any | null;
}

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function LaborContextCard({ labor, netSales, covers, laborExceptions }: Props) {
  if (!labor) {
    return (
      <Card className="bg-muted/30 border-brass/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brass" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Labor Summary
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">No labor data available</p>
        </CardContent>
      </Card>
    );
  }

  const costPerCover = covers > 0 ? labor.labor_cost / covers : 0;
  const hasOT = labor.ot_hours > 0;

  return (
    <Card className="bg-muted/30 border-brass/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-brass" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Labor Summary
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {labor.employee_count} employees
          </span>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(labor.labor_cost)}</div>
            <div className="text-xs text-muted-foreground">Labor Cost</div>
          </div>
          <div>
            <div className={`text-xl font-bold tabular-nums ${
              labor.labor_pct > 30 ? 'text-error' : labor.labor_pct > 25 ? 'text-yellow-500' : ''
            }`}>
              {labor.labor_pct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Labor %</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(labor.splh)}</div>
            <div className="text-xs text-muted-foreground">SPLH</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">
              {labor.covers_per_labor_hour != null
                ? labor.covers_per_labor_hour.toFixed(1)
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground">CPLH</div>
          </div>
        </div>

        {/* Hours + OT */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Total Hours: <span className="font-medium text-foreground">{labor.total_hours.toFixed(1)}</span></span>
          {hasOT && (
            <span className="text-error">
              OT: <span className="font-medium">{labor.ot_hours.toFixed(1)}h</span>
            </span>
          )}
          <span>Cost/Cover: <span className="font-medium text-foreground">{fmt(costPerCover)}</span></span>
        </div>

        {/* Dept breakdown */}
        {(labor.foh || labor.boh) && (
          <div className="flex gap-3 text-xs">
            {labor.foh && (
              <span className="text-muted-foreground">
                FOH: {labor.foh.hours.toFixed(0)}h / {fmt(labor.foh.cost)}
              </span>
            )}
            {labor.boh && (
              <span className="text-muted-foreground">
                BOH: {labor.boh.hours.toFixed(0)}h / {fmt(labor.boh.cost)}
              </span>
            )}
          </div>
        )}

        {/* Labor exceptions alert */}
        {laborExceptions && laborExceptions.exceptions?.length > 0 && (
          <div className="flex items-center gap-2 bg-error/5 border border-error/20 rounded-md px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-error shrink-0" />
            <span className="text-xs text-error font-medium">
              {laborExceptions.exceptions.length} labor exception{laborExceptions.exceptions.length !== 1 ? 's' : ''} detected
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
