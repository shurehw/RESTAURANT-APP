'use client';

import { useCallback } from 'react';
import { CompResolutionPanel } from '@/components/attestation/CompResolutionPanel';
import { CompContextCard } from '../context/CompContextCard';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  CompResolution,
  TriggerResult,
  NightlyAttestation,
  CompPromptKey,
} from '@/lib/attestation/types';
import {
  COMP_PROMPT_KEYS,
  COMP_PROMPT_QUESTIONS,
  COMP_PROMPT_PLACEHOLDERS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

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
  compsByReason?: Array<{ reason: string; qty: number; amount: number }>;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
}: {
  promptKey: CompPromptKey;
  value: string;
  disabled: boolean;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < STRUCTURED_PROMPT_MIN_LENGTH;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate?.({ [promptKey]: e.target.value, comp_acknowledged: false });
    },
    [promptKey, onUpdate],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onUpdate?.({ [promptKey]: e.target.value });
    },
    [promptKey, onUpdate],
  );

  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">{COMP_PROMPT_QUESTIONS[promptKey]}</h4>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        placeholder={COMP_PROMPT_PLACEHOLDERS[promptKey]}
        rows={2}
        maxLength={500}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        {belowMin && (
          <span className="text-[11px] text-muted-foreground">
            {STRUCTURED_PROMPT_MIN_LENGTH - len} more characters needed
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {len}/500
        </span>
      </div>
    </div>
  );
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
  compsByReason = [],
  attestation,
  onUpdate,
}: Props) {
  const allPromptsFilled = COMP_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const isAcknowledged = !!attestation?.comp_acknowledged;

  return (
    <div className="space-y-4">
      <CompContextCard
        totalComps={totalComps}
        netSales={netSales}
        exceptionSummary={exceptionSummary}
        reviewSummary={reviewSummary}
        compsByReason={compsByReason}
      />

      {onUpdate && (
        <>
          {/* 3 structured comp prompts */}
          {COMP_PROMPT_KEYS.map((key) => (
            <PromptField
              key={key}
              promptKey={key}
              value={(attestation?.[key] as string) ?? ''}
              disabled={disabled}
              onUpdate={onUpdate}
            />
          ))}

          {/* Nothing to report toggle — shown when prompts aren't all filled */}
          {!allPromptsFilled && (
            <label className="flex items-center gap-2 px-1 cursor-pointer">
              <Checkbox
                checked={isAcknowledged}
                onCheckedChange={(checked) =>
                  onUpdate({ comp_acknowledged: !!checked })
                }
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">
                Nothing to report — standard comp activity
              </span>
            </label>
          )}
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
