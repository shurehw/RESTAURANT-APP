'use client';

import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, Sparkles, AlertOctagon } from 'lucide-react';

interface CompExceptionSummary {
  total_comps: number;
  net_sales: number;
  comp_pct: number;
  comp_pct_status: 'ok' | 'warning' | 'critical';
  exception_count: number;
  critical_count: number;
  warning_count: number;
}

interface CompReviewSummary {
  totalReviewed: number;
  approved: number;
  needsFollowup: number;
  urgent: number;
  overallAssessment: string;
}

interface Props {
  exceptionSummary: CompExceptionSummary | null;
  reviewSummary: CompReviewSummary | null;
  totalComps: number;
  netSales: number;
}

function fmt(v: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);
}

export function CompContextCard({
  exceptionSummary,
  reviewSummary,
  totalComps,
  netSales,
}: Props) {
  const compPct = netSales > 0 ? (totalComps / netSales) * 100 : 0;

  return (
    <Card className="bg-muted/30 border-brass/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-brass" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Comp Analysis
          </span>
        </div>

        {/* Primary KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xl font-bold tabular-nums">{fmt(totalComps)}</div>
            <div className="text-xs text-muted-foreground">Total Comps</div>
          </div>
          <div>
            <div className={`text-xl font-bold tabular-nums ${
              compPct > 3 ? 'text-error' : compPct > 2 ? 'text-yellow-500' : ''
            }`}>
              {compPct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Comp %</div>
          </div>
          <div>
            <div className="text-xl font-bold tabular-nums">
              {exceptionSummary?.exception_count ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">Exceptions</div>
          </div>
        </div>

        {/* Exception breakdown */}
        {exceptionSummary && exceptionSummary.exception_count > 0 && (
          <div className="flex items-center gap-3">
            {exceptionSummary.critical_count > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-error text-white rounded">
                <AlertOctagon className="h-3 w-3" />
                {exceptionSummary.critical_count} Critical
              </span>
            )}
            {exceptionSummary.warning_count > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-yellow-500 text-white rounded">
                {exceptionSummary.warning_count} Warning
              </span>
            )}
          </div>
        )}

        {/* Daily comp % status */}
        {exceptionSummary && exceptionSummary.comp_pct_status !== 'ok' && (
          <div className={`rounded-md px-3 py-2 text-xs font-medium ${
            exceptionSummary.comp_pct_status === 'critical'
              ? 'bg-error/10 text-error'
              : 'bg-yellow-500/10 text-yellow-600'
          }`}>
            Daily comp % is {exceptionSummary.comp_pct.toFixed(1)}% of net sales
            {exceptionSummary.comp_pct_status === 'critical'
              ? ' (exceeds 3% threshold)'
              : ' (exceeds 2% target)'}
          </div>
        )}

        {/* AI review summary */}
        {reviewSummary && (
          <div className="flex items-start gap-2 bg-brass/5 border border-brass/20 rounded-md p-3">
            <Sparkles className="h-3.5 w-3.5 text-brass mt-0.5 shrink-0" />
            <div className="text-xs">
              <span className="font-medium text-brass">AI Review: </span>
              <span className="text-muted-foreground">
                {reviewSummary.approved} approved, {reviewSummary.needsFollowup} follow-up
                {reviewSummary.urgent > 0 && (
                  <span className="text-error font-medium">, {reviewSummary.urgent} urgent</span>
                )}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
