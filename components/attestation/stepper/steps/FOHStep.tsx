'use client';

import { FOHAttestation } from '@/components/attestation/FOHAttestation';
import { FOHContextCard } from '../context/FOHContextCard';
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
}

export function FOHStep({
  triggers,
  attestation,
  onUpdate,
  disabled,
  labor,
  netSales,
  laborExceptions,
}: Props) {
  return (
    <div className="space-y-4">
      <FOHContextCard
        foh={labor?.foh ?? null}
        netSales={netSales}
        totalLaborCost={labor?.labor_cost ?? 0}
        totalLaborPct={labor?.labor_pct ?? 0}
        laborExceptions={laborExceptions}
      />

      <FOHAttestation
        triggers={triggers}
        attestation={attestation}
        onUpdate={onUpdate}
        disabled={disabled}
        fohData={labor?.foh}
        netSales={netSales}
      />
    </div>
  );
}
