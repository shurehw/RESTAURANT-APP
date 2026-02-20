'use client';

import { useCallback } from 'react';
import { CoachingQueue } from '@/components/attestation/CoachingQueue';
import { Checkbox } from '@/components/ui/checkbox';
import type {
  CoachingAction,
  NightlyAttestation,
  CoachingPromptKey,
} from '@/lib/attestation/types';
import {
  COACHING_PROMPT_KEYS,
  COACHING_PROMPT_QUESTIONS,
  COACHING_PROMPT_PLACEHOLDERS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

interface Props {
  actions: CoachingAction[];
  onAdd: (action: any) => Promise<void>;
  disabled: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
}: {
  promptKey: CoachingPromptKey;
  value: string;
  disabled: boolean;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < STRUCTURED_PROMPT_MIN_LENGTH;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate?.({ [promptKey]: e.target.value, coaching_acknowledged: false });
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
      <h4 className="text-sm font-medium">{COACHING_PROMPT_QUESTIONS[promptKey]}</h4>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        placeholder={COACHING_PROMPT_PLACEHOLDERS[promptKey]}
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

export function CoachingStep({
  actions,
  onAdd,
  disabled,
  attestation,
  onUpdate,
}: Props) {
  const allPromptsFilled = COACHING_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const isAcknowledged = !!attestation?.coaching_acknowledged;

  return (
    <div className="space-y-4">
      {onUpdate && (
        <>
          {/* 3 structured coaching prompts */}
          {COACHING_PROMPT_KEYS.map((key) => (
            <PromptField
              key={key}
              promptKey={key}
              value={(attestation?.[key] as string) ?? ''}
              disabled={disabled}
              onUpdate={onUpdate}
            />
          ))}

          {/* Nothing to report toggle */}
          {!allPromptsFilled && (
            <label className="flex items-center gap-2 px-1 cursor-pointer">
              <Checkbox
                checked={isAcknowledged}
                onCheckedChange={(checked) =>
                  onUpdate({ coaching_acknowledged: !!checked })
                }
                disabled={disabled}
              />
              <span className="text-sm text-muted-foreground">
                Nothing to report — no coaching needed tonight
              </span>
            </label>
          )}
        </>
      )}

      <CoachingQueue
        actions={actions}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
