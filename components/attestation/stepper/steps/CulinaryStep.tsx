'use client';

import { CulinaryFeedback } from '@/components/attestation/CulinaryFeedback';
import type { NightlyAttestation } from '@/lib/attestation/types';
import { GUIDED_PROMPTS } from '@/lib/attestation/types';
import type { CulinaryShiftLog } from '@/lib/culinary/types';

interface Props {
  venueId: string;
  businessDate: string;
  culinaryLog: CulinaryShiftLog | null;
  onCulinaryLogUpdate: (log: CulinaryShiftLog) => void;
  disabled: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function CulinaryStep({
  venueId,
  businessDate,
  culinaryLog,
  onCulinaryLogUpdate,
  disabled,
  attestation,
  onUpdate,
}: Props) {
  const notesLen = attestation?.culinary_notes?.length ?? 0;

  return (
    <div className="space-y-4">
      <CulinaryFeedback
        venueId={venueId}
        businessDate={businessDate}
        culinaryLog={culinaryLog}
        onUpdate={onCulinaryLogUpdate}
        disabled={disabled}
      />

      {onUpdate && (
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
      )}
    </div>
  );
}
