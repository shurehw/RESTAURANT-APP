'use client';

import { AlertTriangle } from 'lucide-react';
import type { NightlyAttestation, TriggerResult, RevenuePromptKey } from '@/lib/attestation/types';
import {
  GUIDED_PROMPTS,
  REVENUE_PROMPT_KEYS,
  REVENUE_PROMPT_PLACEHOLDERS,
  REVENUE_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
}

const TEXTAREA_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none';

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
}: {
  promptKey: RevenuePromptKey;
  value: string;
  disabled: boolean;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < REVENUE_PROMPT_MIN_LENGTH;

  return (
    <div className="space-y-1.5">
      <h4 className="text-sm font-medium">{GUIDED_PROMPTS[promptKey]}</h4>
      <textarea
        className={TEXTAREA_CLASS}
        placeholder={REVENUE_PROMPT_PLACEHOLDERS[promptKey]}
        rows={2}
        maxLength={500}
        value={value}
        onChange={(e) => onUpdate({ [promptKey]: e.target.value })}
        onBlur={(e) => onUpdate({ [promptKey]: e.target.value })}
        disabled={disabled}
      />
      <div className="flex items-center justify-between">
        {belowMin && (
          <span className="text-[11px] text-muted-foreground">
            Minimum {REVENUE_PROMPT_MIN_LENGTH} characters
          </span>
        )}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {len}/500
        </span>
      </div>
    </div>
  );
}

export function RevenueAttestation({ triggers, attestation, onUpdate, disabled }: Props) {
  return (
    <div className="space-y-4">
      {/* Trigger reasons — auto-detected contextual flags */}
      {triggers?.revenue_triggers && triggers.revenue_triggers.length > 0 && (
        <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
            <AlertTriangle className="h-3.5 w-3.5" />
            Flagged
          </div>
          {triggers.revenue_triggers.map((reason, i) => (
            <p key={i} className="text-xs text-muted-foreground pl-5">
              {reason}
            </p>
          ))}
        </div>
      )}

      {/* 6 structured revenue prompts */}
      {REVENUE_PROMPT_KEYS.map((key) => (
        <PromptField
          key={key}
          promptKey={key}
          value={(attestation?.[key] as string) ?? ''}
          disabled={disabled}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}
