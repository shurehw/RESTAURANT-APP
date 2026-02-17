'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, AlertTriangle, Info } from 'lucide-react';

interface CompException {
  type: string;
  severity: string;
  server: string;
  comp_total: number;
  message: string;
}

interface CompByReason {
  reason: string;
  count: number;
  total: number;
}

interface CompData {
  total: number;
  pct: number;
  net_sales: number;
  exception_count: number;
  critical_count: number;
  warning_count: number;
  top_exceptions: CompException[];
  by_reason?: CompByReason[];
}

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

function compColor(_pct: number): string {
  return 'text-foreground';
}

function severityIcon(severity: string) {
  if (severity === 'critical') return <AlertTriangle className="h-3 w-3 text-muted-foreground" />;
  if (severity === 'warning') return <AlertTriangle className="h-3 w-3 text-muted-foreground" />;
  return <Info className="h-3 w-3 text-muted-foreground" />;
}

export function CompCard({ comps, loading }: { comps: CompData | null; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comps</CardTitle>
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!comps) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Comps</CardTitle>
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No comp data</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Comps</CardTitle>
        <ShieldAlert className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {/* Hero: Comp % */}
        <div className={`text-2xl font-bold ${compColor(comps.pct)}`}>
          {comps.pct > 0 ? `${comps.pct.toFixed(1)}%` : '0%'}
        </div>

        {/* Sub-metrics */}
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{fmt(comps.total)}</span>
          <span>of {fmt(comps.net_sales)} net</span>
        </div>

        {/* Comp breakdown by reason */}
        {comps.by_reason && comps.by_reason.length > 0 && comps.total > 0 && (
          <div className="mt-3">
            <div className="space-y-1">
              {comps.by_reason.slice(0, 5).map((r, i) => {
                const pct = comps.net_sales > 0 ? (r.total / comps.net_sales) * 100 : 0;
                return (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground truncate mr-2">{r.reason}</span>
                    <span className="font-medium text-foreground whitespace-nowrap">
                      {fmt(r.total)} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Stacked bar */}
            {comps.total > 0 && (
              <div className="h-2 rounded-full bg-muted overflow-hidden flex mt-1.5">
                {comps.by_reason.slice(0, 5).map((r, i) => {
                  const pct = (r.total / comps.total) * 100;
                  const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-blue-400', 'bg-gray-400'];
                  return pct > 0 ? (
                    <div key={i} className={`${colors[i]} h-full transition-all`} style={{ width: `${pct}%` }} />
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Exception counts */}
        {comps.exception_count > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {comps.critical_count > 0 && (
              <Badge variant="default" className="text-[11px]">
                {comps.critical_count} critical
              </Badge>
            )}
            {comps.warning_count > 0 && (
              <Badge variant="default" className="text-[11px]">
                {comps.warning_count} warning
              </Badge>
            )}
          </div>
        )}

        {/* Top exceptions */}
        {comps.top_exceptions.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {comps.top_exceptions.slice(0, 3).map((ex, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]">
                {severityIcon(ex.severity)}
                <span className="text-muted-foreground leading-tight line-clamp-2">
                  {ex.server}: {fmt(ex.comp_total)} — {ex.message}
                </span>
              </div>
            ))}
          </div>
        )}

        {comps.exception_count === 0 && comps.total > 0 && !comps.by_reason?.length && (
          <div className="mt-2 text-xs text-muted-foreground">No exceptions</div>
        )}
      </CardContent>
    </Card>
  );
}
