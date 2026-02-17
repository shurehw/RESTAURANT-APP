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

export function LaborCard({ labor, loading, netSales }: { labor: LaborData | null; loading?: boolean; netSales?: number }) {
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
  const otherCost = labor.other?.cost ?? 0;
  const totalDeptCost = fohCost + bohCost + otherCost;
  const fohPct = totalDeptCost > 0 ? (fohCost / totalDeptCost) * 100 : 0;
  const bohPct = totalDeptCost > 0 ? (bohCost / totalDeptCost) * 100 : 0;
  const otherPct = totalDeptCost > 0 ? (otherCost / totalDeptCost) * 100 : 0;

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
          {labor.covers_per_labor_hour != null && labor.covers_per_labor_hour > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground col-span-2">
              <span>CPLH:</span>
              <span className="font-medium text-foreground">{labor.covers_per_labor_hour.toFixed(1)}</span>
              <span>covers/labor hr</span>
            </div>
          )}
        </div>

        {/* OT warning */}
        {labor.ot_hours > 0 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            <span>{labor.ot_hours.toFixed(1)}h overtime</span>
          </div>
        )}

        {/* FOH/BOH/Other bar */}
        {totalDeptCost > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground mb-1">
              {fohCost > 0 && (
                <span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1" />
                  FOH {fmt(fohCost)}
                  {netSales && netSales > 0 && (
                    <span className="ml-0.5 font-medium text-foreground">({((fohCost / netSales) * 100).toFixed(1)}%)</span>
                  )}
                </span>
              )}
              {bohCost > 0 && (
                <span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1" />
                  BOH {fmt(bohCost)}
                  {netSales && netSales > 0 && (
                    <span className="ml-0.5 font-medium text-foreground">({((bohCost / netSales) * 100).toFixed(1)}%)</span>
                  )}
                </span>
              )}
              {otherCost > 0 && (
                <span>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mr-1" />
                  Other {fmt(otherCost)}
                  {netSales && netSales > 0 && (
                    <span className="ml-0.5 font-medium text-foreground">({((otherCost / netSales) * 100).toFixed(1)}%)</span>
                  )}
                </span>
              )}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              {fohPct > 0 && (
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${fohPct}%` }}
                />
              )}
              {bohPct > 0 && (
                <div
                  className="bg-orange-500 h-full transition-all"
                  style={{ width: `${bohPct}%` }}
                />
              )}
              {otherPct > 0 && (
                <div
                  className="bg-gray-400 h-full transition-all"
                  style={{ width: `${otherPct}%` }}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
