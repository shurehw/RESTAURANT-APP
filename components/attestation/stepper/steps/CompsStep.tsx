'use client';

import { CompResolutionPanel } from '@/components/attestation/CompResolutionPanel';
import { CompContextCard } from '../context/CompContextCard';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import type {
  CompResolution,
  TriggerResult,
  NightlyAttestation,
  CompTag,
} from '@/lib/attestation/types';
import { COMP_TAGS, COMP_TAG_LABELS } from '@/lib/attestation/types';

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
  // AI narrative + tags
  narrative?: string | null;
  narrativeLoading?: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
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
  narrative,
  narrativeLoading,
  attestation,
  onUpdate,
}: Props) {
  return (
    <div className="space-y-4">
      <CompContextCard
        totalComps={totalComps}
        netSales={netSales}
        exceptionSummary={exceptionSummary}
        reviewSummary={reviewSummary}
      />

      <NarrativeCard
        title="AI Comp Brief"
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
      />

      {onUpdate && (
        <>
          <TagSelector<CompTag>
            tags={COMP_TAGS}
            labels={COMP_TAG_LABELS}
            selected={attestation?.comp_tags ?? []}
            onChange={(tags) => onUpdate({ comp_tags: tags })}
            disabled={disabled}
            title="What drove comps tonight?"
          />

          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Additional comp notes (optional)..."
            rows={2}
            maxLength={500}
            value={attestation?.comp_notes ?? ''}
            onChange={(e) => onUpdate({ comp_notes: e.target.value })}
            onBlur={(e) => onUpdate({ comp_notes: e.target.value })}
            disabled={disabled}
          />
        </>
      )}

      <CompResolutionPanel
        triggers={triggers}
        resolutions={resolutions}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
