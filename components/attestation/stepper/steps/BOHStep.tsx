'use client';

import { BOHAttestation } from '@/components/attestation/BOHAttestation';
import { BOHContextCard } from '../context/BOHContextCard';
import { CulinaryFeedback } from '@/components/attestation/CulinaryFeedback';
import { GUIDED_PROMPTS } from '@/lib/attestation/types';
import type { NightlyAttestation, TriggerResult } from '@/lib/attestation/types';
import type { CulinaryShiftLog } from '@/lib/culinary/types';

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
  // Culinary (embedded module)
  hasCulinary?: boolean;
  venueId?: string;
  businessDate?: string;
  culinaryLog?: CulinaryShiftLog | null;
  onCulinaryLogUpdate?: (log: CulinaryShiftLog) => void;
}

export function BOHStep({
  triggers,
  attestation,
  onUpdate,
  disabled,
  labor,
  netSales,
  laborExceptions,
  hasCulinary,
  venueId,
  businessDate,
  culinaryLog,
  onCulinaryLogUpdate,
}: Props) {
  const notesLen = attestation?.culinary_notes?.length ?? 0;

  return (
    <div className="space-y-4">
      <BOHContextCard
        boh={labor?.boh ?? null}
        netSales={netSales}
        totalLaborCost={labor?.labor_cost ?? 0}
        totalLaborPct={labor?.labor_pct ?? 0}
        laborExceptions={laborExceptions}
      />

      <BOHAttestation
        triggers={triggers}
        attestation={attestation}
        onUpdate={onUpdate}
        disabled={disabled}
        bohData={labor?.boh}
        netSales={netSales}
      />

      {/* Culinary module — embedded in BOH */}
      {hasCulinary && venueId && businessDate && onCulinaryLogUpdate && (
        <>
          <div className="border-t pt-4">
            <CulinaryFeedback
              venueId={venueId}
              businessDate={businessDate}
              culinaryLog={culinaryLog ?? null}
              onUpdate={onCulinaryLogUpdate}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">{GUIDED_PROMPTS.culinary}</h4>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Kitchen execution, 86'd items, food quality, specials, prep issues, highlights..."
              rows={3}
              maxLength={1000}
              value={attestation?.culinary_notes ?? ''}
              onChange={(e) => onUpdate({ culinary_notes: e.target.value })}
              onBlur={(e) => onUpdate({ culinary_notes: e.target.value })}
              disabled={disabled}
            />
            <div className="text-[11px] text-muted-foreground text-right">
              {notesLen}/1000
            </div>
          </div>
        </>
      )}
    </div>
  );
}
