'use client';

import { CompResolutionPanel } from '@/components/attestation/CompResolutionPanel';
import { CompContextCard } from '../context/CompContextCard';
import type { CompResolution, TriggerResult } from '@/lib/attestation/types';

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
  triggers: TriggerResult | null;
  resolutions: CompResolution[];
  onAdd: (resolution: any) => Promise<void>;
  disabled: boolean;
  // Context data
  totalComps: number;
  netSales: number;
  exceptionSummary: CompExceptionSummary | null;
  reviewSummary: CompReviewSummary | null;
}

export function CompsStep({
  triggers,
  resolutions,
  onAdd,
  disabled,
  totalComps,
  netSales,
  exceptionSummary,
  reviewSummary,
}: Props) {
  return (
    <div className="space-y-4">
      <CompContextCard
        totalComps={totalComps}
        netSales={netSales}
        exceptionSummary={exceptionSummary}
        reviewSummary={reviewSummary}
      />

      <CompResolutionPanel
        triggers={triggers}
        resolutions={resolutions}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
