'use client';

import { BOHAttestation } from '@/components/attestation/BOHAttestation';
import { BOHContextCard } from '../context/BOHContextCard';
import { AINarrativePanel } from '../context/AINarrativePanel';
import type { NightlyAttestation, TriggerResult } from '@/lib/attestation/types';

interface LaborData {
  total_hours: number;
  labor_cost: number;
  labor_pct: number;
  splh: number;
  ot_hours: number;
  covers_per_labor_hour: number | null;
  employee_count: number;
  foh: { hours: number; cost: number; employee_count: number } | null;
  boh: { hours: number; cost: number; employee_count: number } | null;
  other: { hours: number; cost: number; employee_count: number } | null;
}

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  labor: LaborData | null;
  netSales: number;
  covers: number;
  laborExceptions?: any | null;
  // AI narrative
  aiNarrative?: string | null;
  aiNarrativeLoading?: boolean;
  aiNarrativeError?: string | null;
}

export function BOHStep({
  triggers,
  attestation,
  onUpdate,
  disabled,
  labor,
  netSales,
  laborExceptions,
  aiNarrative,
  aiNarrativeLoading = false,
  aiNarrativeError,
}: Props) {
  return (
    <div className="space-y-4">
      <BOHContextCard
        boh={labor?.boh ?? null}
        foh={labor?.foh ?? null}
        netSales={netSales}
        totalLaborCost={labor?.labor_cost ?? 0}
        totalLaborPct={labor?.labor_pct ?? 0}
        laborExceptions={laborExceptions}
      />

      <AINarrativePanel
        narrative={aiNarrative}
        loading={aiNarrativeLoading}
        label="Labor Analysis"
        error={aiNarrativeError}
      />

      <BOHAttestation
        triggers={triggers}
        attestation={attestation}
        onUpdate={onUpdate}
        disabled={disabled}
        bohData={labor?.boh}
        netSales={netSales}
      />
    </div>
  );
}
