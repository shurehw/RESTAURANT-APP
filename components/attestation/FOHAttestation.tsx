'use client';

import { useCallback } from 'react';
import { AlertTriangle, UserCheck, Settings } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { NightlyAttestation, TriggerResult, FOHPromptKey } from '@/lib/attestation/types';
import {
  FOH_PROMPT_KEYS,
  FOH_PROMPT_QUESTIONS,
  FOH_PROMPT_PLACEHOLDERS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  fohData?: { hours: number; cost: number; employee_count: number } | null;
  netSales: number;
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;

const PROMPT_ICONS: Record<FOHPromptKey, React.ElementType> = {
  labor_foh_coverage: UserCheck,
  foh_staffing_decision: Settings,
};

const PROMPT_SECTION_LABELS: Record<FOHPromptKey, string> = {
  labor_foh_coverage: 'Floor Coverage & Service Pacing',
  foh_staffing_decision: 'Staffing Adjustments',
};

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
  fohData,
  netSales,
}: {
  promptKey: FOHPromptKey;
  value: string;
  disabled: boolean;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  fohData?: { hours: number; cost: number; employee_count: number } | null;
  netSales: number;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < STRUCTURED_PROMPT_MIN_LENGTH;
  const Icon = PROMPT_ICONS[promptKey];

  // Show context chips on the coverage prompt
  const showContext = promptKey === 'labor_foh_coverage' && fohData;
  const pctOfSales = fohData && netSales > 0 ? ((fohData.cost / netSales) * 100).toFixed(1) : null;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ [promptKey]: e.target.value, foh_acknowledged: false });
    },
    [promptKey, onUpdate],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onUpdate({ [promptKey]: e.target.value });
    },
    [promptKey, onUpdate],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brass" />
        <h4 className="text-sm font-medium">{PROMPT_SECTION_LABELS[promptKey]}</h4>
        {showContext && (
          <span className="text-xs text-muted-foreground ml-auto">
            {fohData.employee_count} staff · {fohData.hours.toFixed(0)}h · {fmt(fohData.cost)}{pctOfSales ? ` (${pctOfSales}%)` : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{FOH_PROMPT_QUESTIONS[promptKey]}</p>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        placeholder={FOH_PROMPT_PLACEHOLDERS[promptKey]}
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

export function FOHAttestation({ triggers, attestation, onUpdate, disabled, fohData, netSales }: Props) {
  const allPromptsFilled = FOH_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const isAcknowledged = !!attestation?.foh_acknowledged;

  return (
    <div className="space-y-4">
      {/* Trigger reasons */}
      {triggers?.labor_triggers && triggers.labor_triggers.length > 0 && (
        <div className="bg-brass/5 border border-brass/20 rounded-md p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium text-brass">
            <AlertTriangle className="h-3.5 w-3.5" />
            Flagged
          </div>
          {triggers.labor_triggers.map((reason, i) => (
            <p key={i} className="text-xs text-muted-foreground pl-5">
              {reason}
            </p>
          ))}
        </div>
      )}

      {/* 2 structured FOH prompts */}
      {FOH_PROMPT_KEYS.map((key) => (
        <PromptField
          key={key}
          promptKey={key}
          value={(attestation?.[key] as string) ?? ''}
          disabled={disabled}
          onUpdate={onUpdate}
          fohData={fohData}
          netSales={netSales}
        />
      ))}

      {/* Nothing to report toggle */}
      {!allPromptsFilled && (
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <Checkbox
            checked={isAcknowledged}
            onCheckedChange={(checked) =>
              onUpdate({ foh_acknowledged: !!checked })
            }
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            Nothing to report — standard FOH staffing tonight
          </span>
        </label>
      )}
    </div>
  );
}
