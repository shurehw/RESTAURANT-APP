'use client';

import { Card, CardContent } from '@/components/ui/card';
import { UserCheck, AlertTriangle } from 'lucide-react';

interface DeptData {
  hours: number;
  cost: number;
  employee_count: number;
}

interface Props {
  foh: DeptData | null;
  boh: DeptData | null;
  netSales: number;
  totalLaborCost: number;
  totalLaborPct: number;
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

export function FOHContextCard({ foh, boh, netSales, totalLaborCost, totalLaborPct, laborExceptions }: Props) {
  if (!foh) {
    return (
      <Card className="bg-muted/30 border-brass/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-brass" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              FOH — Front of House
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">No FOH labor data available</p>
        </CardContent>
      </Card>
    );
  }

  const fohPct = netSales > 0 ? (foh.cost / netSales) * 100 : 0;
  const fohSplh = foh.hours > 0 ? netSales / foh.hours : 0;
  const bohPct = boh && netSales > 0 ? (boh.cost / netSales) * 100 : 0;

  return (
    <Card className="bg-muted/30 border-brass/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-brass" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            FOH — Front of House
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {foh.employee_count} employees
          </span>
        </div>

        {/* FOH KPIs — primary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(foh.cost)}</div>
            <div className="text-xs text-muted-foreground">FOH Cost</div>
          </div>
          <div>
            <div className={`text-xl font-bold tabular-nums ${
              fohPct > 20 ? 'text-error' : fohPct > 15 ? 'text-yellow-500' : ''
            }`}>
              {fohPct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">% of Sales</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{foh.hours.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Hours</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(fohSplh)}</div>
            <div className="text-xs text-muted-foreground">SPLH</div>
          </div>
        </div>

        {/* Labor summary — total + other dept reference */}
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Total labor: {fmt(totalLaborCost)} ({totalLaborPct.toFixed(1)}%)</div>
          {boh && (
            <div>BOH: {fmt(boh.cost)} ({bohPct.toFixed(1)}%) · {boh.hours.toFixed(1)}h · {boh.employee_count} staff</div>
          )}
        </div>

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
