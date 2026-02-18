'use client';

import { RevenueAttestation } from '@/components/attestation/RevenueAttestation';
import { RevenueContextCard } from '../context/RevenueContextCard';
import type { NightlyAttestation, TriggerResult } from '@/lib/attestation/types';

interface Props {
  triggers: TriggerResult | null;
  attestation: NightlyAttestation | null;
  onUpdate: (fields: Partial<NightlyAttestation>) => void;
  disabled: boolean;
  // Context data
  netSales: number;
  totalCovers: number;
  totalComps: number;
  forecast?: { net_sales: number | null; covers: number | null } | null;
  variance?: {
    vs_forecast_pct: number | null;
    vs_sdlw_pct: number | null;
    vs_sdly_pct: number | null;
  } | null;
  foodSales?: number;
  beverageSales?: number;
  beveragePct?: number;
  narrative?: string | null;
  narrativeLoading?: boolean;
}

export function RevenueStep({
  triggers,
  attestation,
  onUpdate,
  disabled,
  netSales,
  totalCovers,
  totalComps,
  forecast,
  variance,
  foodSales,
  beverageSales,
  beveragePct,
  narrative,
  narrativeLoading,
}: Props) {
  return (
    <div className="space-y-4">
      <RevenueContextCard
        netSales={netSales}
        totalCovers={totalCovers}
        totalComps={totalComps}
        forecast={forecast}
        variance={variance}
        foodSales={foodSales}
        beverageSales={beverageSales}
        beveragePct={beveragePct}
      />

      <RevenueAttestation
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
