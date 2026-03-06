'use client';

import { useCallback } from 'react';
import { AlertTriangle, ChefHat, Settings } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { NightlyAttestation, TriggerResult, BOHPromptKey } from '@/lib/attestation/types';
import {
  BOH_PROMPT_KEYS,
  BOH_PROMPT_QUESTIONS,
  BOH_PROMPT_PLACEHOLDERS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  bohData?: { hours: number; cost: number; employee_count: number } | null;
  netSales: number;
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;

const PROMPT_ICONS: Record<BOHPromptKey, React.ElementType> = {
  labor_boh_performance: ChefHat,
  boh_staffing_decision: Settings,
};

const PROMPT_SECTION_LABELS: Record<BOHPromptKey, string> = {
  labor_boh_performance: 'Kitchen Staffing & Line Performance',
  boh_staffing_decision: 'Staffing Adjustments',
};

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
  bohData,
  netSales,
}: {
  promptKey: BOHPromptKey;
  value: string;
  disabled: boolean;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  bohData?: { hours: number; cost: number; employee_count: number } | null;
  netSales: number;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < STRUCTURED_PROMPT_MIN_LENGTH;
  const Icon = PROMPT_ICONS[promptKey];

  // Show context chips on the performance prompt
  const showContext = promptKey === 'labor_boh_performance' && bohData;
  const pctOfSales = bohData && netSales > 0 ? ((bohData.cost / netSales) * 100).toFixed(1) : null;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ [promptKey]: e.target.value, boh_acknowledged: false });
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
            {bohData.employee_count} staff · {bohData.hours.toFixed(0)}h · {fmt(bohData.cost)}{pctOfSales ? ` (${pctOfSales}%)` : ''}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{BOH_PROMPT_QUESTIONS[promptKey]}</p>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        placeholder={BOH_PROMPT_PLACEHOLDERS[promptKey]}
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

export function BOHAttestation({ triggers, attestation, onUpdate, disabled, bohData, netSales }: Props) {
  const allPromptsFilled = BOH_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const isAcknowledged = !!attestation?.boh_acknowledged;

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

      {/* 2 structured BOH prompts */}
      {BOH_PROMPT_KEYS.map((key) => (
        <PromptField
          key={key}
          promptKey={key}
          value={(attestation?.[key] as string) ?? ''}
          disabled={disabled}
          onUpdate={onUpdate}
          bohData={bohData}
          netSales={netSales}
        />
      ))}

      {/* Nothing to report toggle */}
      {!allPromptsFilled && (
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <Checkbox
            checked={isAcknowledged}
            onCheckedChange={(checked) =>
              onUpdate({ boh_acknowledged: !!checked })
            }
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            Nothing to report — standard BOH staffing tonight
          </span>
        </label>
      )}
    </div>
  );
}
