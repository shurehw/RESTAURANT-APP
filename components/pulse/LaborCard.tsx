'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, Clock, Users, TrendingUp, AlertTriangle } from 'lucide-react';

interface LaborDeptBreakdown {
  hours: number;
  cost: number;
  employee_count: number;
}

interface LaborData {
  total_hours: number;
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  covers_per_labor_hour: number | null;
  employee_count: number;
  punch_count: number;
  foh: LaborDeptBreakdown | null;
  boh: LaborDeptBreakdown | null;
  other: LaborDeptBreakdown | null;
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

function laborColor(_pct: number): string {
  return 'text-foreground';
}

export function LaborCard({ labor, loading }: { labor: LaborData | null; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Labor</CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!labor) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Labor</CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No labor data</div>
        </CardContent>
      </Card>
    );
  }

  const fohCost = labor.foh?.cost ?? 0;
  const bohCost = labor.boh?.cost ?? 0;
  const totalDeptCost = fohCost + bohCost + (labor.other?.cost ?? 0);
  const fohPct = totalDeptCost > 0 ? (fohCost / totalDeptCost) * 100 : 50;
  const bohPct = totalDeptCost > 0 ? (bohCost / totalDeptCost) * 100 : 50;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Labor</CardTitle>
        <Briefcase className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {/* Hero: Labor % */}
        <div className={`text-2xl font-bold ${laborColor(labor.labor_pct)}`}>
          {labor.labor_pct > 0 ? `${labor.labor_pct.toFixed(1)}%` : '—'}
        </div>

        {/* Sub-metrics */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>Cost:</span>
            <span className="font-medium text-foreground">{fmt(labor.labor_cost)}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="font-medium text-foreground">{labor.total_hours.toFixed(1)}h</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>SPLH:</span>
            <span className="font-medium text-foreground">{fmt(labor.splh)}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />
            <span className="font-medium text-foreground">{labor.employee_count}</span>
            <span>staff</span>
          </div>
        </div>

        {/* OT warning */}
        {labor.ot_hours > 0 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            <span>{labor.ot_hours.toFixed(1)}h overtime</span>
          </div>
        )}

        {/* FOH/BOH bar */}
        {totalDeptCost > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>FOH {fmt(fohCost)}</span>
              <span>BOH {fmt(bohCost)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              <div
                className="bg-blue-500 h-full transition-all"
                style={{ width: `${fohPct}%` }}
              />
              <div
                className="bg-orange-500 h-full transition-all"
                style={{ width: `${bohPct}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
