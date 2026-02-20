'use client';

import { useCallback } from 'react';
import { AlertTriangle, UserCheck, ChefHat, Settings } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { NightlyAttestation, TriggerResult, LaborPromptKey } from '@/lib/attestation/types';
import {
  LABOR_PROMPT_KEYS,
  LABOR_PROMPT_QUESTIONS,
  LABOR_PROMPT_PLACEHOLDERS,
  STRUCTURED_PROMPT_MIN_LENGTH,
} from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  fohData?: { hours: number; cost: number; employee_count: number } | null;
  bohData?: { hours: number; cost: number; employee_count: number } | null;
  otherData?: { hours: number; cost: number; employee_count: number } | null;
  netSales: number;
  otHours?: number;
  cplh?: number | null;
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;

const PROMPT_ICONS: Record<LaborPromptKey, React.ElementType> = {
  labor_foh_coverage: UserCheck,
  labor_boh_performance: ChefHat,
  labor_decision: Settings,
};

const PROMPT_SECTION_LABELS: Record<LaborPromptKey, string> = {
  labor_foh_coverage: 'FOH — Front of House',
  labor_boh_performance: 'BOH — Back of House',
  labor_decision: 'Staffing & Efficiency',
};

function PromptField({
  promptKey,
  value,
  disabled,
  onUpdate,
  fohData,
  bohData,
  otherData,
  netSales,
  otHours,
  cplh,
}: {
  promptKey: LaborPromptKey;
  value: string;
  disabled: boolean;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  fohData?: { hours: number; cost: number; employee_count: number } | null;
  bohData?: { hours: number; cost: number; employee_count: number } | null;
  otherData?: { hours: number; cost: number; employee_count: number } | null;
  netSales: number;
  otHours?: number;
  cplh?: number | null;
}) {
  const len = value.length;
  const belowMin = len > 0 && len < STRUCTURED_PROMPT_MIN_LENGTH;
  const Icon = PROMPT_ICONS[promptKey];
  const contextData = promptKey === 'labor_foh_coverage' ? fohData : promptKey === 'labor_boh_performance' ? bohData : null;
  const pctOfSales = contextData && netSales > 0 ? ((contextData.cost / netSales) * 100).toFixed(1) : null;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onUpdate({ [promptKey]: e.target.value, labor_acknowledged: false });
    },
    [promptKey, onUpdate],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      onUpdate({ [promptKey]: e.target.value });
    },
    [promptKey, onUpdate],
  );

  // Build context chips for the staffing & efficiency section
  const staffingContext: string[] = [];
  if (promptKey === 'labor_decision') {
    if (otherData) {
      const otherPct = netSales > 0 ? ((otherData.cost / netSales) * 100).toFixed(1) : null;
      staffingContext.push(`Other: ${otherData.employee_count} staff · ${otherData.hours.toFixed(0)}h · ${fmt(otherData.cost)}${otherPct ? ` (${otherPct}%)` : ''}`);
    }
    if (otHours != null) staffingContext.push(`OT: ${otHours.toFixed(1)}h`);
    if (cplh != null) staffingContext.push(`CPLH: ${cplh.toFixed(1)}`);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-brass" />
        <h4 className="text-sm font-medium">{PROMPT_SECTION_LABELS[promptKey]}</h4>
        {contextData && (
          <span className="text-xs text-muted-foreground ml-auto">
            {contextData.employee_count} staff · {contextData.hours.toFixed(0)}h · {fmt(contextData.cost)}{pctOfSales ? ` (${pctOfSales}%)` : ''}
          </span>
        )}
      </div>
      {staffingContext.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {staffingContext.map((chip, i) => (
            <span key={i}>{chip}</span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{LABOR_PROMPT_QUESTIONS[promptKey]}</p>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        placeholder={LABOR_PROMPT_PLACEHOLDERS[promptKey]}
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

export function LaborAttestation({ triggers, attestation, onUpdate, disabled, fohData, bohData, otherData, netSales, otHours, cplh }: Props) {
  const allPromptsFilled = LABOR_PROMPT_KEYS.every(
    (k) => ((attestation?.[k] as string)?.length ?? 0) >= STRUCTURED_PROMPT_MIN_LENGTH,
  );
  const isAcknowledged = !!attestation?.labor_acknowledged;

  return (
    <div className="space-y-4">
      {/* Trigger reasons — contextual callout */}
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

      {/* 3 structured labor prompts */}
      {LABOR_PROMPT_KEYS.map((key) => (
        <PromptField
          key={key}
          promptKey={key}
          value={(attestation?.[key] as string) ?? ''}
          disabled={disabled}
          onUpdate={onUpdate}
          fohData={fohData}
          bohData={bohData}
          otherData={otherData}
          netSales={netSales}
          otHours={otHours}
          cplh={cplh}
        />
      ))}

      {/* Nothing to report toggle — shown when prompts aren't all filled */}
      {!allPromptsFilled && (
        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <Checkbox
            checked={isAcknowledged}
            onCheckedChange={(checked) =>
              onUpdate({ labor_acknowledged: !!checked })
            }
            disabled={disabled}
          />
          <span className="text-sm text-muted-foreground">
            Nothing to report — standard staffing tonight
          </span>
        </label>
      )}
    </div>
  );
}
