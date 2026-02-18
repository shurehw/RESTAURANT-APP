'use client';

import { LaborAttestation } from '@/components/attestation/LaborAttestation';
import { LaborContextCard } from '../context/LaborContextCard';
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
  // Context data
  labor: LaborData | null;
  netSales: number;
  covers: number;
  laborExceptions?: any | null;
  narrative?: string | null;
  narrativeLoading?: boolean;
}

export function LaborStep({
  triggers,
  attestation,
  onUpdate,
  disabled,
  labor,
  netSales,
  covers,
  laborExceptions,
  narrative,
  narrativeLoading,
}: Props) {
  return (
    <div className="space-y-4">
      <LaborContextCard
        labor={labor}
        netSales={netSales}
        covers={covers}
        laborExceptions={laborExceptions}
      />

      <LaborAttestation
        triggers={triggers}
        attestation={attestation}
        onUpdate={onUpdate}
        disabled={disabled}
        narrative={narrative}
        narrativeLoading={narrativeLoading}
      />
    </div>
  );
}
