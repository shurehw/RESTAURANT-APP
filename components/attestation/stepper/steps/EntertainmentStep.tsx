'use client';

import { EntertainmentFeedback } from '@/components/attestation/EntertainmentFeedback';
import { NarrativeCard } from '@/components/attestation/NarrativeCard';
import { TagSelector } from '@/components/attestation/TagSelector';
import type {
  NightlyAttestation,
  EntertainmentTag,
} from '@/lib/attestation/types';
import { ENTERTAINMENT_TAGS, ENTERTAINMENT_TAG_LABELS } from '@/lib/attestation/types';
import type { ShiftLog } from '@/lib/entertainment/types';

interface Props {
  venueId: string;
  businessDate: string;
  shiftLog: ShiftLog | null;
  onShiftLogUpdate: (log: ShiftLog) => void;
  disabled: boolean;
  // AI narrative + tags
  narrative?: string | null;
  narrativeLoading?: boolean;
  attestation?: NightlyAttestation | null;
  onUpdate?: (fields: Partial<NightlyAttestation>) => void;
}

export function EntertainmentStep({
  venueId,
  businessDate,
  shiftLog,
  onShiftLogUpdate,
  disabled,
  narrative,
  narrativeLoading,
  attestation,
  onUpdate,
}: Props) {
  return (
    <div className="space-y-4">
      <NarrativeCard
        title="AI Entertainment Brief"
        narrative={narrative ?? null}
        loading={narrativeLoading ?? false}
      />

      <EntertainmentFeedback
        venueId={venueId}
        businessDate={businessDate}
        shiftLog={shiftLog}
        onUpdate={onShiftLogUpdate}
        disabled={disabled}
      />

      {onUpdate && (
        <>
          <TagSelector<EntertainmentTag>
            tags={ENTERTAINMENT_TAGS}
            labels={ENTERTAINMENT_TAG_LABELS}
            selected={attestation?.entertainment_tags ?? []}
            onChange={(tags) => onUpdate({ entertainment_tags: tags })}
            disabled={disabled}
            title="What defined tonight's entertainment?"
          />

          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            placeholder="Additional entertainment notes (optional)..."
            rows={2}
            maxLength={500}
            value={attestation?.entertainment_notes ?? ''}
            onChange={(e) => onUpdate({ entertainment_notes: e.target.value })}
            onBlur={(e) => onUpdate({ entertainment_notes: e.target.value })}
            disabled={disabled}
          />
        </>
      )}
    </div>
  );
}
