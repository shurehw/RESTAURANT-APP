'use client';

import { FOHAttestation } from '@/components/attestation/FOHAttestation';
import { FOHContextCard } from '../context/FOHContextCard';
import { EntertainmentFeedback } from '@/components/attestation/EntertainmentFeedback';
import { GUIDED_PROMPTS } from '@/lib/attestation/types';
import type { NightlyAttestation, TriggerResult } from '@/lib/attestation/types';
import type { ShiftLog } from '@/lib/entertainment/types';

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
  // Entertainment (embedded module)
  hasEntertainment?: boolean;
  venueId?: string;
  businessDate?: string;
  shiftLog?: ShiftLog | null;
  onShiftLogUpdate?: (log: ShiftLog) => void;
}

export function FOHStep({
  triggers,
  attestation,
  onUpdate,
  disabled,
  labor,
  netSales,
  laborExceptions,
  hasEntertainment,
  venueId,
  businessDate,
  shiftLog,
  onShiftLogUpdate,
}: Props) {
  const notesLen = attestation?.entertainment_notes?.length ?? 0;

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

      {/* Entertainment module — embedded in FOH */}
      {hasEntertainment && venueId && businessDate && onShiftLogUpdate && (
        <>
          <div className="border-t pt-4">
            <EntertainmentFeedback
              venueId={venueId}
              businessDate={businessDate}
              shiftLog={shiftLog ?? null}
              onUpdate={onShiftLogUpdate}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-medium">{GUIDED_PROMPTS.entertainment}</h4>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Crowd energy, DJ/band performance, sound quality, vibe, any issues..."
              rows={3}
              maxLength={1000}
              value={attestation?.entertainment_notes ?? ''}
              onChange={(e) => onUpdate({ entertainment_notes: e.target.value })}
              onBlur={(e) => onUpdate({ entertainment_notes: e.target.value })}
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
