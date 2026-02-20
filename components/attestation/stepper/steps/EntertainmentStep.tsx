'use client';

import { EntertainmentFeedback } from '@/components/attestation/EntertainmentFeedback';
import type { NightlyAttestation } from '@/lib/attestation/types';
import { GUIDED_PROMPTS } from '@/lib/attestation/types';
import type { ShiftLog } from '@/lib/entertainment/types';

interface Props {
  venueId: string;
  businessDate: string;
  shiftLog: ShiftLog | null;
  onShiftLogUpdate: (log: ShiftLog) => void;
  disabled: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function EntertainmentStep({
  venueId,
  businessDate,
  shiftLog,
  onShiftLogUpdate,
  disabled,
  attestation,
  onUpdate,
}: Props) {
  const notesLen = attestation?.entertainment_notes?.length ?? 0;

  return (
    <div className="space-y-4">
      <EntertainmentFeedback
        venueId={venueId}
        businessDate={businessDate}
        shiftLog={shiftLog}
        onUpdate={onShiftLogUpdate}
        disabled={disabled}
      />

      {onUpdate && (
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
      )}
    </div>
  );
}
